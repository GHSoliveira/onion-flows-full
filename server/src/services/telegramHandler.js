import adapter from '../../db/DatabaseAdapter.js';
import { addUserMessage, addBotMessage, applyUserInput, getChatById, runFlow, startChatFlow } from './flowRunner.js';
import { answerCallbackQuery, sendTelegramMessage } from './telegramApi.js';
import { ensureTenantLimit } from './tenantLimits.js';

const normalizeEnvValue = (value) => {
  if (!value) return null;
  const trimmed = String(value).trim();
  return trimmed.length ? trimmed : null;
};

const getTelegramFlowId = () => normalizeEnvValue(process.env.TELEGRAM_FLOW_ID);
const getTelegramTenantId = () => normalizeEnvValue(process.env.TELEGRAM_TENANT_ID);

const ensureFlow = async (tenantId, flowId) => {
  const flows = await adapter.getCollection('flows', tenantId);
  if (!flows || flows.length === 0) return null;

  let flow = null;
  if (flowId) {
    flow = flows.find((f) => f.id === flowId) || null;
  }

  if (!flow) {
    flow = flows.find((f) => f.published && f.published.nodes && f.published.nodes.length > 0) || flows[0];
  }

  return flow ? (flow.published || flow) : null;
};

const ensureTemplates = async (tenantId) => {
  const scoped = await adapter.getCollection('templates', tenantId);
  if (scoped && scoped.length) return scoped;
  const scopedAlt = await adapter.getCollection('messageTemplates', tenantId);
  if (scopedAlt && scopedAlt.length) return scopedAlt;
  const all = await adapter.getCollection('templates');
  if (all && all.length) return all;
  return adapter.getCollection('messageTemplates');
};

const ensureSchedules = async (tenantId) => {
  const scoped = await adapter.getCollection('schedules', tenantId);
  if (scoped && scoped.length) return scoped;
  return adapter.getCollection('schedules');
};

const createChat = async (userId, telegramChatId, tenantId) => {
  await ensureTenantLimit(tenantId, 'chats');
  const allChats = await adapter.getCollection('activeChats');
  const chat = {
    id: `chat_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    customerCpf: `tg_${userId}`,
    status: 'active',
    messages: [],
    vars: {},
    tenantId,
    channel: 'telegram',
    channelUserId: String(userId),
    channelChatId: telegramChatId ? String(telegramChatId) : null,
    currentNodeId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  allChats.push(chat);
  await adapter.saveCollection('activeChats', allChats);
  return chat;
};

const getOrCreateSession = async (userId, telegramChatId, tenantId, flowId) => {
  const sessions = await adapter.getCollection('telegramSessions');
  let session = sessions.find((s) => String(s.userId) === String(userId)) || null;

  if (!session) {
    const chat = await createChat(userId, telegramChatId, tenantId);
    session = {
      id: `tg_${userId}`,
      userId: String(userId),
      telegramChatId: String(telegramChatId),
      chatId: chat.id,
      flowId,
      tenantId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    sessions.push(session);
    await adapter.saveCollection('telegramSessions', sessions);
    return { session, chat };
  }

    session.telegramChatId = String(telegramChatId);
    session.updatedAt = new Date().toISOString();
    await adapter.saveCollection('telegramSessions', sessions);

  let chat = await getChatById(session.chatId);
  if (!chat || chat.status === 'closed') {
    chat = await createChat(userId, telegramChatId, tenantId);
    session.chatId = chat.id;
    session.updatedAt = new Date().toISOString();
    await adapter.saveCollection('telegramSessions', sessions);
  } else if (telegramChatId && chat.channelChatId !== String(telegramChatId)) {
    const allChats = await adapter.getCollection('activeChats');
    const idx = allChats.findIndex((c) => c.id === chat.id);
    if (idx !== -1) {
      allChats[idx].channelChatId = String(telegramChatId);
      allChats[idx].updatedAt = new Date().toISOString();
      await adapter.saveCollection('activeChats', allChats);
    }
  }

  return { session, chat };
};

const resetSession = async (userId, telegramChatId, tenantId, flowId) => {
  const sessions = await adapter.getCollection('telegramSessions');
  let session = sessions.find((s) => String(s.userId) === String(userId)) || null;
  const chat = await createChat(userId, telegramChatId, tenantId);
  if (!session) {
    session = {
      id: `tg_${userId}`,
      userId: String(userId),
      telegramChatId: String(telegramChatId),
      chatId: chat.id,
      flowId,
      tenantId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    sessions.push(session);
  } else {
    session.telegramChatId = String(telegramChatId);
    session.chatId = chat.id;
    session.updatedAt = new Date().toISOString();
  }
  await adapter.saveCollection('telegramSessions', sessions);
  return { session, chat };
};

export const handleTelegramUpdate = async (update, config = null) => {
  if (!update) return;
  const isCallback = Boolean(update.callback_query);
  const message = isCallback ? update.callback_query.message : update.message;
  const from = isCallback ? update.callback_query.from : update.message?.from;
  const text = update.message?.text || null;
  const buttonId = update.callback_query?.data || null;
  const callbackId = update.callback_query?.id || null;

  if (!message || !from) return;

  const telegramChatId = message.chat?.id;
  const telegramUserId = from.id;
  if (!telegramChatId || !telegramUserId) return;

  if (update.message?.date) {
    const sentAt = new Date(update.message.date * 1000).toISOString();
    console.log(`[TG] Message date ${sentAt} server ${new Date().toISOString()}`);
  }

  const tenantId = config?.tenantId || getTelegramTenantId();
  const flowId = config?.flowId || getTelegramFlowId();
  const botToken = config?.botToken || process.env.TELEGRAM_BOT_TOKEN;

  const sendMessage = async (msgText, buttons) => {
    await sendTelegramMessage(telegramChatId, msgText, buttons, botToken);
  };

  if (callbackId) {
    try {
      await answerCallbackQuery(callbackId, botToken);
    } catch (error) {
      const msg = String(error?.message || '');
      if (!msg.includes('query is too old') && !msg.includes('query ID is invalid')) {
        console.warn('Erro ao responder callback do Telegram:', msg);
      }
    }
  }

  const isReset = text && (text.trim().toLowerCase() === '/start' || text.trim().toLowerCase() === '/reset');
  const { chat } = isReset
    ? await resetSession(telegramUserId, telegramChatId, tenantId, flowId)
    : await getOrCreateSession(telegramUserId, telegramChatId, tenantId, flowId);

  const flowData = await ensureFlow(tenantId, flowId);
  if (!flowData || !flowData.nodes) {
    await sendMessage('Nenhum fluxo publicado encontrado para este bot.');
    return;
  }

  const templates = await ensureTemplates(tenantId);
  const schedules = await ensureSchedules(tenantId);

  if (text && !isCallback) {
    await addUserMessage(chat.id, text);
  }

  let currentChat = await getChatById(chat.id);

  if (!currentChat.currentNodeId) {
    if (currentChat.flowStarted && !isReset) {
      return;
    }
    await startChatFlow({
      chatId: currentChat.id,
      flowData,
      templates,
      schedules,
      sendMessage
    });
    currentChat = await getChatById(currentChat.id);
    if (isReset) return;
    if (!currentChat.currentNodeId) return;
  }

  if (isCallback) {
    await applyUserInput({
      chat: currentChat,
      flowData,
      text: null,
      buttonId,
      templates,
      schedules,
      sendMessage
    });
    return;
  }

  if (text && !isReset) {
    await applyUserInput({
      chat: currentChat,
      flowData,
      text,
      buttonId: null,
      templates,
      schedules,
      sendMessage
    });
  }
};
