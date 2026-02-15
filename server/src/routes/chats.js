import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireTenant } from '../middleware/tenant.js';
import adapter from '../../db/DatabaseAdapter.js';
import { sendTelegramMessage } from '../services/telegramApi.js';
import { getTelegramConfig } from '../services/channelConfig.js';
import { runFlow } from '../services/flowRunner.js';
import { getIo } from '../services/logs.js';
import { createLog } from '../services/logs.js';
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
  const chatIndex = allChats.findIndex(c => c.id === id);
  if (chatIndex === -1) {
    res.status(404).json({ error: 'Chat nÃ£o encontrado' });
    return null;
  }
  const chat = allChats[chatIndex];
  if (req.user.role !== 'SUPER_ADMIN' && chat.tenantId !== req.tenantId) {
    res.status(403).json({ error: 'Acesso negado' });
    return null;
  }
  return { allChats, chatIndex, chat };
};

// Iniciar ou buscar chat de simulação
router.post('/init', authenticate, requireTenant, async (req, res) => {
  try {
    const { customerCpf } = req.body;
    const tenantId = req.tenantId || req.user?.tenantId || null;
    
    if (!customerCpf) {
      return res.status(400).json({ error: 'customerCpf é obrigatório' });
    }
    if (!tenantId) {
      return res.status(400).json({ error: 'tenantId é obrigatório' });
    }

    // Verificar se já existe chat ativo para este CPF
    const allChats = await getScopedChats(req);
    let chat = allChats.find(c => c.customerCpf === customerCpf && c.status !== 'closed');

    if (!chat) {
      await ensureTenantLimit(tenantId, 'chats');
      // Criar novo chat
      chat = {
        id: `chat_${Date.now()}`,
        customerCpf,
        status: 'active',
        messages: [],
        vars: {},
        tenantId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      allChats.push(chat);
      await adapter.saveCollection('activeChats', allChats);
    } else {
      // Retornar chat existente
      chat.updatedAt = new Date().toISOString();
      if (tenantId) {
        chat.tenantId = tenantId;
      }
      await adapter.saveCollection('activeChats', allChats);
    }

    res.json(chat);
    await createLog('CHAT_START', { chatId: chat.id, customerCpf: chat.customerCpf, tenantId: chat.tenantId }, req.user?.id || 'system');
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Adicionar mensagem ao chat
router.post('/:id/messages', authenticate, requireTenant, async (req, res) => {
  try {
    const { sender, text, buttons } = req.body;
    const { id } = req.params;

    const loaded = await loadChatById(req, res, id);
    if (!loaded) return;
    const { allChats, chatIndex, chat } = loaded;

    const message = {
      id: `msg_${Date.now()}`,
      sender,
      text,
      buttons: buttons || null,
      timestamp: new Date().toISOString()
    };

    allChats[chatIndex].messages.push(message);
    allChats[chatIndex].updatedAt = new Date().toISOString();
    await adapter.saveCollection('activeChats', allChats);

    if (sender === 'agent' && chat.channel === 'telegram' && chat.channelChatId) {
      const config = chat.tenantId ? await getTelegramConfig(chat.tenantId) : null;
      const botToken = config?.botToken || process.env.TELEGRAM_BOT_TOKEN || null;
      if (botToken) {
        await sendTelegramMessage(chat.channelChatId, text, buttons || null, botToken);
      }
    }

    const io = getIo();
    if (io) {
      io.emit('new_message', { chatId: id, message });
    }
    await createLog('CHAT_MESSAGE', { chatId: id, sender, text, tenantId: chat.tenantId }, req.user?.id || 'system');

    res.json(message);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Atualizar variáveis do chat
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
    await createLog('CHAT_VARS_UPDATE', {
      chatId: id,
      queue: allChats[chatIndex].queue || null,
      tenantId: allChats[chatIndex].tenantId,
      preferredAgentId: allChats[chatIndex].preferredAgentId || null
    }, req.user?.id || 'system');

    const io = getIo();
    if (io) {
      io.emit('new_chat_in_queue', { chat: allChats[chatIndex] });
    }

    res.json(allChats[chatIndex].vars);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Transferir chat para uma fila
router.post('/transfer', authenticate, requireTenant, async (req, res) => {
  try {
    const { chatId, queue, reason, continueFlow = true, resumeNodeId = null, agentId = null, agentName = null } = req.body;

    if (!chatId) {
      return res.status(400).json({ error: 'chatId é obrigatório' });
    }

    const loaded = await loadChatById(req, res, chatId);
    if (!loaded) return;
    const { allChats, chatIndex } = loaded;

    const now = new Date().toISOString();

    // Sempre cair na fila, mesmo com agente selecionado
    allChats[chatIndex].status = 'waiting';
    allChats[chatIndex].transferredTo = queue;
    allChats[chatIndex].transferReason = reason || 'Fluxo automático';
    allChats[chatIndex].transferredAt = now;
    allChats[chatIndex].waitingSince = now;
    allChats[chatIndex].continueFlowAfterQueue = continueFlow;
    allChats[chatIndex].resumeNodeId = continueFlow ? resumeNodeId : null;
    allChats[chatIndex].resumePending = false;
    allChats[chatIndex].updatedAt = now;
    allChats[chatIndex].queue = queue;
    allChats[chatIndex].agentId = null;
    allChats[chatIndex].agentName = null;
    if (agentId) {
      allChats[chatIndex].preferredAgentId = agentId;
      allChats[chatIndex].preferredAgentName = agentName || null;
    } else {
      allChats[chatIndex].preferredAgentId = null;
      allChats[chatIndex].preferredAgentName = null;
    }

    await adapter.saveCollection('activeChats', allChats);
    const chat = allChats[chatIndex];
    await createLog('CHAT_TRANSFER', {
      chatId,
      queue,
      reason: reason || null,
      tenantId: chat.tenantId,
      preferredAgentId: agentId || null
    }, req.user.id);

    const io = getIo();
    if (io) {
      io.emit('agent_assigned', { chat: allChats[chatIndex] });
    }

    res.json({ 
      success: true, 
      message: `Chat transferido para a fila ${queue}`,
      chat: allChats[chatIndex]
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const agentQueuesForUser = (user) => {
  const queues = (user && Array.isArray(user.queues)) ? user.queues : [];
  return queues
    .map(q => (typeof q === 'string' ? q.toUpperCase() : '').trim())
    .filter(Boolean);
};

router.get('/my-queues', authenticate, requireTenant, async (req, res) => {
  try {
    const allChats = await adapter.getCollection('activeChats', req.tenantId);
    const normalizedQueues = agentQueuesForUser(req.user);

    const waiting = allChats.filter(chat =>
      chat.status === 'waiting' &&
      chat.queue &&
      normalizedQueues.includes(chat.queue.toUpperCase())
    );

    const active = allChats.filter(chat =>
      chat.agentId === req.user.id &&
      chat.status === 'open'
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
    const filtered = allChats.filter(chat => chat.agentId === agentId);

    filtered.sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0));

    const uniqueCustomers = new Set(
      filtered
        .map(chat => chat.customerCpf || chat.channelUserId || chat.channelChatId)
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

router.post('/pickup', authenticate, requireTenant, async (req, res) => {
  try {
    const { chatId } = req.body;
    if (!chatId) {
      return res.status(400).json({ error: 'chatId é obrigatório' });
    }

    const normalizedQueues = agentQueuesForUser(req.user);
    const loaded = await loadChatById(req, res, chatId);
    if (!loaded) return;
    const { allChats, chatIndex, chat } = loaded;
    if (chat.status !== 'waiting') {
      return res.status(400).json({ error: 'Chat não está em fila' });
    }

    if (!chat.queue || !normalizedQueues.includes(chat.queue.toUpperCase())) {
      return res.status(403).json({ error: 'Você não pertence a essa fila' });
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
    await createLog('CHAT_PICKUP', {
      chatId,
      tenantId: chat.tenantId,
      queue: chat.queue || null,
      agentId: req.user.id
    }, req.user.id);

    const io = getIo();
    if (io) {
      io.emit('agent_assigned', { chat });
    }

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

// Fechar chat
router.put('/:id/close', authenticate, requireTenant, async (req, res) => {
  try {
    const { continueFlow } = req.body;
    const { id } = req.params;

    const loaded = await loadChatById(req, res, id);
    if (!loaded) return;
    const { allChats, chatIndex, chat } = loaded;
    const shouldContinue = continueFlow && chat.continueFlowAfterQueue && chat.resumeNodeId;

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
      const userIndex = users.findIndex(u => u.id === chat.agentId);
      if (userIndex === -1) return;

      const user = users[userIndex];
      const ratingCount = Number(user.ratingCount || 0) + 1;
      const ratingSum = Number(user.ratingSum || 0) + ratingValue;
      const ratingAvg = ratingSum / ratingCount;
      console.log(`[RATING] Agent ${user.id} (${user.name}) -> +${ratingValue}, avg ${ratingAvg.toFixed(2)} (${ratingCount})`);

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
    await createLog('CHAT_CLOSE', { chatId: id, tenantId: chat.tenantId, continueFlow: shouldContinue }, req.user.id);

    const io = getIo();
    if (io) {
      io.emit('chat_closed', { chatId: id });
    }

    if (shouldContinue && chat.channel === 'telegram' && chat.resumeNodeId) {
      const config = chat.tenantId ? await getTelegramConfig(chat.tenantId) : null;
      const botToken = config?.botToken || process.env.TELEGRAM_BOT_TOKEN || null;
      const tenantId = chat.tenantId || config?.tenantId || null;
      const flowId = config?.flowId || null;

      if (botToken) {
        const flows = await adapter.getCollection('flows', tenantId);
        let flow = null;
        if (flowId) {
          flow = flows.find((f) => f.id === flowId) || null;
        }
        if (!flow) {
          flow = flows.find((f) => f.published && f.published.nodes && f.published.nodes.length > 0) || flows[0];
        }

        const flowData = flow ? (flow.published || flow) : null;
        if (flowData && flowData.nodes) {
          const templates = await adapter.getCollection('templates', tenantId);
          const templatesAlt = await adapter.getCollection('messageTemplates', tenantId);
          const schedules = await adapter.getCollection('schedules', tenantId);
          const sendMessage = async (msgText, buttons) => {
            await sendTelegramMessage(chat.channelChatId, msgText, buttons, botToken);
          };

          chat.resumePending = false;
          chat.status = 'bot';
          await adapter.saveCollection('activeChats', allChats);

          await runFlow({
            nodeId: chat.resumeNodeId,
            flowData,
            currentVars: chat.vars || {},
            chatId: chat.id,
            templates: (templates && templates.length ? templates : templatesAlt) || [],
            schedules: schedules || [],
            sendMessage
          });
        }
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

router.get('/:id', authenticate, requireTenant, async (req, res) => {
  try {
    const chats = await adapter.getCollection('activeChats');
    const chat = chats.find(c => c.id === req.params.id);

    if (!chat) return res.status(404).json({ error: 'Chat não encontrado' });

    if (req.user.role !== 'SUPER_ADMIN' && chat.tenantId !== req.tenantId) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    res.json(chat);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;






