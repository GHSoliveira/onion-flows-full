import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireTenant } from '../middleware/tenant.js';
import adapter from '../../db/DatabaseAdapter.js';
import { sendTelegramMessage, getTelegramFile, getTelegramFileUrl } from '../services/telegramApi.js';
import { getTelegramConfig } from '../services/channelConfig.js';
import { addUserMessage, applyUserInput, getChatById, runFlow, startChatFlow } from '../services/flowRunner.js';
import { createLog, getIo } from '../services/logs.js';
import { ensureTenantLimit } from '../services/tenantLimits.js';

const router = express.Router();

const getScopedChats = async (req) => {
  if (req.user?.role === 'SUPER_ADMIN') {
    if (req.tenantId) {
      return adapter.getCollection('activeChats', req.tenantId);
    }
    return adapter.getCollection('activeChats');
  }
  return adapter.getCollection('activeChats', req.tenantId);
};

const loadChatById = async (req, res, id) => {
  const allChats = await getScopedChats(req);
  const chatIndex = allChats.findIndex((chat) => chat.id === id);
  if (chatIndex === -1) {
    res.status(404).json({ error: 'Chat nao encontrado' });
    return null;
  }

  const chat = allChats[chatIndex];
  if (req.user.role !== 'SUPER_ADMIN' && chat.tenantId !== req.tenantId) {
    res.status(403).json({ error: 'Acesso negado' });
    return null;
  }

  return { allChats, chatIndex, chat };
};

const loadFlowRuntime = async (tenantId, flowId = null) => {
  const flows = await adapter.getCollection('flows', tenantId);
  let flow = null;

  if (flowId) {
    flow = flows.find((entry) => entry.id === flowId) || null;
  }

  if (!flow) {
    flow = flows.find((entry) => entry.published?.nodes?.length) || flows[0] || null;
  }

  const flowData = flow ? (flow.published || flow) : null;
  if (!flowData?.nodes?.length) {
    return null;
  }

  const templates = await adapter.getCollection('templates', tenantId);
  const fallbackTemplates = await adapter.getCollection('messageTemplates', tenantId);
  const schedules = await adapter.getCollection('schedules', tenantId);

  return {
    flow,
    flowData,
    templates: (templates && templates.length ? templates : fallbackTemplates) || [],
    schedules: schedules || []
  };
};

const emitEvent = (event, payload) => {
  const io = getIo();
  if (io) {
    io.emit(event, payload);
  }
};

const isActiveTelegramSessionForChat = async (chat) => {
  if (!chat || chat.channel !== 'telegram') return false;

  const tenantId = chat.tenantId || null;
  const sessions = await adapter.getCollection('telegramSessions', tenantId);
  if (!Array.isArray(sessions) || sessions.length === 0) return false;

  const sameTenant = (session) => {
    if (!tenantId) return true;
    return !session?.tenantId || String(session.tenantId) === String(tenantId);
  };

  if (chat.channelUserId) {
    const sessionByUser = sessions.find(
      (session) =>
        sameTenant(session) &&
        String(session.userId || '') === String(chat.channelUserId)
    );
    if (sessionByUser) {
      return String(sessionByUser.chatId || '') === String(chat.id);
    }
  }

  if (chat.channelChatId) {
    const sessionByChat = sessions.find(
      (session) =>
        sameTenant(session) &&
        String(session.telegramChatId || '') === String(chat.channelChatId)
    );
    if (sessionByChat) {
      return String(sessionByChat.chatId || '') === String(chat.id);
    }
  }

  return false;
};

const agentQueuesForUser = (user) => {
  const queues = user && Array.isArray(user.queues) ? user.queues : [];
  return queues
    .map((queue) => (typeof queue === 'string' ? queue.toUpperCase() : '').trim())
    .filter(Boolean);
};

router.post('/init', authenticate, requireTenant, async (req, res) => {
  try {
    const { customerCpf, flowId = null, mode = 'default' } = req.body;
    const tenantId = req.tenantId || req.user?.tenantId || null;
    const isSimulator = mode === 'simulator';

    if (!customerCpf) {
      return res.status(400).json({ error: 'customerCpf e obrigatorio' });
    }
    if (!tenantId) {
      return res.status(400).json({ error: 'tenantId e obrigatorio' });
    }
    if (isSimulator && !flowId) {
      return res.status(400).json({ error: 'flowId e obrigatorio para simulacao' });
    }

    const allChats = await getScopedChats(req);
    let chat = allChats.find((entry) => entry.customerCpf === customerCpf && entry.status !== 'closed');

    if (!chat) {
      await ensureTenantLimit(tenantId, 'chats');
      chat = {
        id: `chat_${Date.now()}`,
        customerCpf,
        status: isSimulator ? 'bot' : 'active',
        messages: [],
        vars: {},
        tenantId,
        channel: isSimulator ? 'simulator' : null,
        simulationFlowId: isSimulator ? flowId : null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      allChats.push(chat);
      await adapter.saveCollection('activeChats', allChats);
    } else {
      chat.updatedAt = new Date().toISOString();
      chat.tenantId = tenantId;
      if (isSimulator) {
        chat.channel = 'simulator';
        chat.simulationFlowId = flowId;
        chat.status = chat.status === 'closed' ? 'bot' : (chat.status || 'bot');
      }
      await adapter.saveCollection('activeChats', allChats);
    }

    if (isSimulator) {
      const runtime = await loadFlowRuntime(tenantId, flowId);
      if (!runtime) {
        return res.status(404).json({ error: 'Fluxo publicado nao encontrado para simulacao' });
      }

      if (!chat.flowStarted && (!Array.isArray(chat.messages) || chat.messages.length === 0)) {
        await startChatFlow({
          chatId: chat.id,
          flowData: runtime.flowData,
          templates: runtime.templates,
          schedules: runtime.schedules,
          sendMessage: null
        });
      }

      chat = await getChatById(chat.id);
    }

    res.json(chat);
    await createLog(
      'CHAT_START',
      { chatId: chat.id, customerCpf: chat.customerCpf, tenantId: chat.tenantId },
      req.user?.id || 'system'
    );
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/messages', authenticate, requireTenant, async (req, res) => {
  try {
    const { sender, text, buttons, buttonId = null } = req.body;
    const { id } = req.params;

    const loaded = await loadChatById(req, res, id);
    if (!loaded) return;
    const { allChats, chatIndex, chat } = loaded;

    if (chat.channel === 'simulator' && sender === 'user' && chat.status === 'closed') {
      return res.status(400).json({ error: 'Chat encerrado' });
    }

    let message = null;

    if (chat.channel === 'simulator' && sender === 'user') {
      message = await addUserMessage(id, text);
    } else {
      message = {
        id: `msg_${Date.now()}`,
        sender,
        text,
        buttons: buttons || null,
        timestamp: new Date().toISOString()
      };

      allChats[chatIndex].messages.push(message);
      allChats[chatIndex].updatedAt = new Date().toISOString();
      await adapter.saveCollection('activeChats', allChats);
    }

    if (sender === 'agent' && chat.channel === 'telegram' && chat.channelChatId) {
      const config = chat.tenantId ? await getTelegramConfig(chat.tenantId) : null;
      const botToken = config?.botToken || process.env.TELEGRAM_BOT_TOKEN || null;
      if (botToken) {
        await sendTelegramMessage(chat.channelChatId, text, buttons || null, botToken);
      }
    }

    if (chat.channel === 'simulator' && sender === 'user' && chat.simulationFlowId) {
      const runtime = await loadFlowRuntime(chat.tenantId, chat.simulationFlowId);
      const currentChat = await getChatById(chat.id);
      if (runtime && currentChat && currentChat.status !== 'waiting' && currentChat.status !== 'open') {
        await applyUserInput({
          chat: currentChat,
          flowData: runtime.flowData,
          text,
          buttonId,
          templates: runtime.templates,
          schedules: runtime.schedules,
          sendMessage: null
        });
      }
    }

    emitEvent('new_message', { chatId: id, message });
    await createLog(
      'CHAT_MESSAGE',
      { chatId: id, sender, text, tenantId: chat.tenantId },
      req.user?.id || 'system'
    );

    res.json(message);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id/vars', authenticate, requireTenant, async (req, res) => {
  try {
    const vars = req.body?.vars !== undefined ? req.body.vars : req.body;
    const { id } = req.params;

    const loaded = await loadChatById(req, res, id);
    if (!loaded) return;
    const { allChats, chatIndex } = loaded;

    allChats[chatIndex].vars = vars;
    allChats[chatIndex].updatedAt = new Date().toISOString();
    await adapter.saveCollection('activeChats', allChats);
    await createLog(
      'CHAT_VARS_UPDATE',
      {
        chatId: id,
        queue: allChats[chatIndex].queue || null,
        tenantId: allChats[chatIndex].tenantId,
        preferredAgentId: allChats[chatIndex].preferredAgentId || null
      },
      req.user?.id || 'system'
    );

    emitEvent('new_chat_in_queue', { chat: allChats[chatIndex] });
    res.json(allChats[chatIndex].vars);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/transfer', authenticate, requireTenant, async (req, res) => {
  try {
    const {
      chatId,
      queue,
      reason,
      continueFlow = true,
      resumeNodeId = null,
      agentId = null,
      agentName = null
    } = req.body;

    if (!chatId) {
      return res.status(400).json({ error: 'chatId e obrigatorio' });
    }

    const loaded = await loadChatById(req, res, chatId);
    if (!loaded) return;
    const { allChats, chatIndex } = loaded;
    const now = new Date().toISOString();

    allChats[chatIndex].status = 'waiting';
    allChats[chatIndex].transferredTo = queue;
    allChats[chatIndex].transferReason = reason || 'Fluxo automatico';
    allChats[chatIndex].transferredAt = now;
    allChats[chatIndex].waitingSince = now;
    allChats[chatIndex].continueFlowAfterQueue = continueFlow;
    allChats[chatIndex].resumeNodeId = continueFlow ? resumeNodeId : null;
    allChats[chatIndex].resumePending = false;
    allChats[chatIndex].updatedAt = now;
    allChats[chatIndex].queue = queue;
    allChats[chatIndex].agentId = null;
    allChats[chatIndex].agentName = null;
    allChats[chatIndex].preferredAgentId = agentId || null;
    allChats[chatIndex].preferredAgentName = agentId ? (agentName || null) : null;

    await adapter.saveCollection('activeChats', allChats);
    const chat = allChats[chatIndex];
    await createLog(
      'CHAT_TRANSFER',
      {
        chatId,
        queue,
        reason: reason || null,
        tenantId: chat.tenantId,
        preferredAgentId: agentId || null
      },
      req.user.id
    );

    emitEvent('agent_assigned', { chat });
    res.json({
      success: true,
      message: `Chat transferido para a fila ${queue}`,
      chat
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/my-queues', authenticate, requireTenant, async (req, res) => {
  try {
    const allChats = await adapter.getCollection('activeChats', req.tenantId);
    const normalizedQueues = agentQueuesForUser(req.user);

    const waiting = allChats.filter(
      (chat) =>
        chat.status === 'waiting' &&
        chat.queue &&
        normalizedQueues.includes(chat.queue.toUpperCase())
    );

    const active = allChats.filter(
      (chat) => chat.agentId === req.user.id && chat.status === 'open'
    );

    res.json({ waiting, active });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/agent/:agentId', authenticate, requireTenant, async (req, res) => {
  try {
    const { agentId } = req.params;
    const limit = Number(req.query.limit || 50);
    const allChats = await adapter.getCollection('activeChats', req.tenantId);
    const filtered = allChats.filter((chat) => chat.agentId === agentId);

    filtered.sort(
      (a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0)
    );

    const uniqueCustomers = new Set(
      filtered
        .map((chat) => chat.customerCpf || chat.channelUserId || chat.channelChatId)
        .filter(Boolean)
    );

    res.json({
      total: filtered.length,
      uniqueCustomers: uniqueCustomers.size,
      chats: filtered.slice(0, Math.max(1, limit))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/history/:cpf', authenticate, requireTenant, async (req, res) => {
  try {
    const targetCpf = String(req.params.cpf || '').trim();
    const allChats = await adapter.getCollection('activeChats', req.tenantId);
    const history = (allChats || [])
      .filter((chat) => String(chat.customerCpf || '') === targetCpf)
      .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0));

    res.json(history);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/pickup', authenticate, requireTenant, async (req, res) => {
  try {
    const { chatId } = req.body;
    if (!chatId) {
      return res.status(400).json({ error: 'chatId e obrigatorio' });
    }

    const normalizedQueues = agentQueuesForUser(req.user);
    const loaded = await loadChatById(req, res, chatId);
    if (!loaded) return;
    const { allChats, chatIndex, chat } = loaded;

    if (chat.status !== 'waiting') {
      return res.status(400).json({ error: 'Chat nao esta em fila' });
    }

    if (!chat.queue || !normalizedQueues.includes(chat.queue.toUpperCase())) {
      return res.status(403).json({ error: 'Voce nao pertence a essa fila' });
    }

    chat.status = 'open';
    chat.agentId = req.user.id;
    chat.agentName = req.user.name;
    chat.updatedAt = new Date().toISOString();
    chat.waitingSince = null;
    const handoffMessage = `Seu atendimento deve ser iniciado agora por ${req.user.name}.`;

    chat.messages.push({
      id: `msg_${Date.now()}`,
      sender: 'system',
      text: `O agente ${req.user.name} assumiu o atendimento.`,
      timestamp: new Date().toISOString()
    });
    chat.messages.push({
      id: `msg_${Date.now()}_handoff`,
      sender: 'bot',
      text: handoffMessage,
      timestamp: new Date().toISOString()
    });

    await adapter.saveCollection('activeChats', allChats);
    await createLog(
      'CHAT_PICKUP',
      { chatId, tenantId: chat.tenantId, queue: chat.queue || null, agentId: req.user.id },
      req.user.id
    );

    emitEvent('agent_assigned', { chat });

    if (chat.channel === 'telegram' && chat.channelChatId) {
      const config = chat.tenantId ? await getTelegramConfig(chat.tenantId) : null;
      const botToken = config?.botToken || process.env.TELEGRAM_BOT_TOKEN || null;
      if (botToken) {
        await sendTelegramMessage(chat.channelChatId, handoffMessage, null, botToken);
      }
    }

    res.json(chat);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id/close', authenticate, requireTenant, async (req, res) => {
  try {
    const { continueFlow } = req.body;
    const { id } = req.params;

    const loaded = await loadChatById(req, res, id);
    if (!loaded) return;
    const { allChats, chatIndex, chat } = loaded;
    const wantsContinue = continueFlow && chat.continueFlowAfterQueue && chat.resumeNodeId;
    let shouldContinue = Boolean(wantsContinue);

    if (shouldContinue && chat.channel === 'telegram') {
      const isActiveSession = await isActiveTelegramSessionForChat(chat);
      if (!isActiveSession) {
        shouldContinue = false;
        console.warn(
          `[CHAT_CLOSE] Telegram resume bloqueado para chat ${chat.id}: sessao ativa divergente.`
        );
      }
    }

    if (shouldContinue) {
      chat.status = 'bot';
      chat.resumePending = true;
      chat.continueFlowAfterQueue = false;
      chat.transferredTo = null;
      chat.updatedAt = new Date().toISOString();
    } else {
      chat.status = 'closed';
      chat.closedAt = new Date().toISOString();
    }

    const tryUpdateAgentRating = async () => {
      if (!chat.agentId || !chat.vars) return;
      const ratingValue = Number(chat.vars.nota ?? chat.vars.rating ?? chat.vars.avaliacao);
      if (!Number.isFinite(ratingValue) || ratingValue < 1 || ratingValue > 5) return;

      const users = await adapter.getCollection('users');
      const userIndex = users.findIndex((user) => user.id === chat.agentId);
      if (userIndex === -1) return;

      const user = users[userIndex];
      const ratingCount = Number(user.ratingCount || 0) + 1;
      const ratingSum = Number(user.ratingSum || 0) + ratingValue;
      const ratingAvg = ratingSum / ratingCount;

      users[userIndex] = {
        ...user,
        ratingCount,
        ratingSum,
        ratingAvg,
        lastRatingAt: new Date().toISOString()
      };

      await adapter.saveCollection('users', users);
    };

    await tryUpdateAgentRating();
    await adapter.saveCollection('activeChats', allChats);
    await createLog(
      'CHAT_CLOSE',
      { chatId: id, tenantId: chat.tenantId, continueFlow: shouldContinue },
      req.user.id
    );

    emitEvent('chat_closed', { chatId: id });

    if (shouldContinue && chat.resumeNodeId) {
      const config =
        chat.channel === 'telegram' && chat.tenantId ? await getTelegramConfig(chat.tenantId) : null;
      const runtime = await loadFlowRuntime(
        chat.tenantId || config?.tenantId || null,
        chat.simulationFlowId || config?.flowId || null
      );

      if (runtime) {
        let sendMessage = null;

        if (chat.channel === 'telegram' && chat.channelChatId) {
          const botToken = config?.botToken || process.env.TELEGRAM_BOT_TOKEN || null;
          if (botToken) {
            sendMessage = async (msgText, actionButtons) => {
              await sendTelegramMessage(chat.channelChatId, msgText, actionButtons, botToken);
            };
          }
        }

        chat.resumePending = false;
        chat.status = 'bot';
        await adapter.saveCollection('activeChats', allChats);

        await runFlow({
          nodeId: chat.resumeNodeId,
          flowData: runtime.flowData,
          currentVars: chat.vars || {},
          chatId: chat.id,
          templates: runtime.templates,
          schedules: runtime.schedules,
          sendMessage
        });
      }
    }

    res.json({ success: true, resumePending: shouldContinue });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/resume', authenticate, requireTenant, async (req, res) => {
  try {
    const { id } = req.params;
    const loaded = await loadChatById(req, res, id);
    if (!loaded) return;
    const { allChats, chatIndex } = loaded;

    allChats[chatIndex].resumePending = false;
    allChats[chatIndex].status = 'open';
    await adapter.saveCollection('activeChats', allChats);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/', authenticate, requireTenant, async (req, res) => {
  try {
    const chats = await adapter.getCollection('activeChats', req.tenantId);
    const page = Math.max(parseInt(req.query.page || '1', 10) || 1, 1);
    const limitRaw = parseInt(req.query.limit || '0', 10) || 0;
    const limit = limitRaw > 0 ? Math.min(Math.max(limitRaw, 1), 500) : 0;

    if (!limit) {
      return res.json(chats);
    }

    const total = chats?.length || 0;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const start = (page - 1) * limit;
    const items = (chats || []).slice(start, start + limit);
    res.json({ items, total, page, totalPages, limit });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id/messages/:messageId/media', authenticate, requireTenant, async (req, res) => {
  try {
    const loaded = await loadChatById(req, res, req.params.id);
    if (!loaded) return;

    const { chat } = loaded;
    const message = Array.isArray(chat.messages)
      ? chat.messages.find((entry) => entry.id === req.params.messageId)
      : null;

    if (!message?.media?.fileId || chat.channel !== 'telegram') {
      return res.status(404).json({ error: 'Midia nao encontrada' });
    }

    const config = chat.tenantId ? await getTelegramConfig(chat.tenantId) : null;
    const botToken = config?.botToken || process.env.TELEGRAM_BOT_TOKEN || null;
    if (!botToken) {
      return res.status(500).json({ error: 'Telegram bot token nao configurado' });
    }

    const fileMeta = await getTelegramFile(message.media.fileId, botToken);
    const fileUrl = getTelegramFileUrl(fileMeta?.file_path, botToken);
    if (!fileUrl) {
      return res.status(404).json({ error: 'Arquivo nao encontrado no Telegram' });
    }

    const upstream = await fetch(fileUrl);
    if (!upstream.ok) {
      return res.status(502).json({ error: 'Falha ao obter arquivo do Telegram' });
    }

    const contentType = upstream.headers.get('content-type') || message.media.mimeType || 'application/octet-stream';
    const contentLength = upstream.headers.get('content-length');
    const dispositionName = message.media.fileName || `${message.media.kind || 'media'}_${message.id}`;

    res.setHeader('Content-Type', contentType);
    if (contentLength) {
      res.setHeader('Content-Length', contentLength);
    }
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.setHeader('Content-Disposition', `inline; filename="${dispositionName}"`);

    const buffer = Buffer.from(await upstream.arrayBuffer());
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id', authenticate, requireTenant, async (req, res) => {
  try {
    const chats = await getScopedChats(req);
    const chat = chats.find((entry) => entry.id === req.params.id);

    if (!chat) {
      return res.status(404).json({ error: 'Chat nao encontrado' });
    }

    if (req.user.role !== 'SUPER_ADMIN' && chat.tenantId !== req.tenantId) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    res.json(chat);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
