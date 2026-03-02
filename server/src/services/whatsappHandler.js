import adapter from '../../db/DatabaseAdapter.js';
import { addUserMessage, applyUserInput, getChatById, runFlow, startChatFlow } from './flowRunner.js';
import { getAllWhatsAppConfigs, getWhatsAppConfig } from './channelConfig.js';
import { sendWhatsAppText } from './whatsappApi.js';
import { createLog } from './logs.js';
import { ensureTenantLimit } from './tenantLimits.js';

const normalizeEnvValue = (value) => {
  if (!value) return null;
  const trimmed = String(value).trim();
  return trimmed.length ? trimmed : null;
};

const normalizeWhatsappNumber = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return raw;
  // BR heuristic: +55 DDD + 8 digits -> insert 9 after DDD
  if (raw.startsWith('55') && raw.length === 12) {
    return `${raw.slice(0, 4)}9${raw.slice(4)}`;
  }
  return raw;
};

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

const parseWebhookMessages = (payload) => {
  const results = [];
  const entries = Array.isArray(payload?.entry) ? payload.entry : [];
  entries.forEach((entry) => {
    const changes = Array.isArray(entry.changes) ? entry.changes : [];
    changes.forEach((change) => {
      const value = change?.value || {};
      const phoneNumberId = value?.metadata?.phone_number_id || null;
      const messages = Array.isArray(value.messages) ? value.messages : [];
      messages.forEach((msg) => {
        if (msg?.type !== 'text') return;
        const text = msg?.text?.body || '';
        if (!text) return;
        results.push({
          messageId: msg.id,
          from: String(msg.from || ''),
          text,
          timestamp: msg.timestamp || null,
          phoneNumberId
        });
      });
    });
  });
  return results;
};

const parseWebhookStatuses = (payload) => {
  const results = [];
  const entries = Array.isArray(payload?.entry) ? payload.entry : [];
  entries.forEach((entry) => {
    const changes = Array.isArray(entry.changes) ? entry.changes : [];
    changes.forEach((change) => {
      const value = change?.value || {};
      const phoneNumberId = value?.metadata?.phone_number_id || null;
      const statuses = Array.isArray(value.statuses) ? value.statuses : [];
      statuses.forEach((st) => {
        results.push({
          id: st.id,
          status: st.status,
          recipientId: st.recipient_id,
          timestamp: st.timestamp || null,
          phoneNumberId,
          errors: Array.isArray(st.errors) ? st.errors : null
        });
      });
    });
  });
  return results;
};

const resolveConfig = async ({ tenantId, phoneNumberId }) => {
  if (tenantId) {
    return getWhatsAppConfig(tenantId);
  }
  if (!phoneNumberId) return null;
  const configs = await getAllWhatsAppConfigs();
  const entry = configs.find((c) => String(c.whatsapp.phoneNumberId) === String(phoneNumberId));
  return entry ? { ...entry.whatsapp, tenantId: entry.tenantId } : null;
};

const getOrCreateChat = async ({ from, tenantId }) => {
  const allChats = await adapter.getCollection('activeChats');
  let chat = allChats.find(
    (c) => c.channel === 'whatsapp' && c.channelUserId === from && c.status !== 'closed'
  );

  if (!chat) {
    await ensureTenantLimit(tenantId, 'chats');
    chat = {
      id: `chat_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      customerCpf: `wa_${from}`,
      status: 'active',
      messages: [],
      vars: {},
      tenantId,
      channel: 'whatsapp',
      channelUserId: from,
      channelChatId: from,
      currentNodeId: null,
      processedMessageIds: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    allChats.push(chat);
    await adapter.saveCollection('activeChats', allChats);
  }

  return chat;
};

const markMessageProcessed = async (chatId, messageId) => {
  if (!messageId) return false;
  const allChats = await adapter.getCollection('activeChats');
  const index = allChats.findIndex((c) => c.id === chatId);
  if (index === -1) return false;
  const chat = allChats[index];
  const processed = Array.isArray(chat.processedMessageIds) ? chat.processedMessageIds : [];
  if (processed.includes(messageId)) return false;
  processed.push(messageId);
  chat.processedMessageIds = processed.slice(-50);
  chat.updatedAt = new Date().toISOString();
  await adapter.saveCollection('activeChats', allChats);
  return true;
};

export const handleWhatsAppWebhook = async ({ payload, tenantId = null }) => {
  const messages = parseWebhookMessages(payload);
  const statuses = parseWebhookStatuses(payload);

  if (statuses.length) {
    statuses.forEach((st) => {
      const info = {
        messageId: st.id,
        status: st.status,
        recipientId: st.recipientId,
        phoneNumberId: st.phoneNumberId,
        timestamp: st.timestamp,
        errors: st.errors || null
      };
      console.log('[WHATSAPP] Status update', info);
      createLog('WHATSAPP_STATUS', info, 'system');
    });
  }

  if (!messages.length) return { ok: true, processed: 0 };

  let processed = 0;
  for (const msg of messages) {
    const config = await resolveConfig({ tenantId, phoneNumberId: msg.phoneNumberId });
    if (!config || !config.enabled || !config.accessToken || !config.phoneNumberId) {
      continue;
    }

    const chat = await getOrCreateChat({ from: msg.from, tenantId: config.tenantId || tenantId });
    const accepted = await markMessageProcessed(chat.id, msg.messageId);
    if (!accepted) continue;

    await addUserMessage(chat.id, msg.text);

    const flowId = normalizeEnvValue(config.flowId) || null;
    const flowData = await ensureFlow(chat.tenantId, flowId);
    if (!flowData || !flowData.nodes) {
      continue;
    }

    const templates = await ensureTemplates(chat.tenantId);
    const schedules = await ensureSchedules(chat.tenantId);

    const sendMessage = async (text) => {
      const to = normalizeWhatsappNumber(msg.from);
      await sendWhatsAppText({
        accessToken: config.accessToken,
        phoneNumberId: config.phoneNumberId,
        to,
        text
      });
    };

    let currentChat = await getChatById(chat.id);

    if (!currentChat.currentNodeId) {
      await startChatFlow({
        chatId: currentChat.id,
        flowData,
        templates,
        schedules,
        sendMessage
      });
      processed += 1;
      continue;
    }

    await applyUserInput({
      chat: currentChat,
      flowData,
      text: msg.text,
      buttonId: null,
      templates,
      schedules,
      sendMessage
    });
    processed += 1;
  }

  return { ok: true, processed };
};
