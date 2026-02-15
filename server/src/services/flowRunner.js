import adapter from '../../db/DatabaseAdapter.js';

const DAY_LABELS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

const parseText = (text, vars) => {
  if (!text) return '';
  return text.replace(/\{([\w\.[\]]+)\}/g, (match, path) => {
    try {
      const keys = path.split(/[.[\]]/).filter(Boolean);
      let value = vars;
      for (const key of keys) {
        if (value === undefined || value === null) return match;
        value = value[key];
      }
      return value !== undefined ? String(value) : match;
    } catch (err) {
      return match;
    }
  });
};

const resolveVariables = (varMap, globalVars) => {
  const localContext = { ...globalVars };
  if (varMap && Array.isArray(varMap)) {
    varMap.forEach((mapping) => {
      if (mapping.global && mapping.local) {
        localContext[mapping.local] = globalVars[mapping.global];
      }
    });
  }
  return localContext;
};

const toMinutes = (timeStr) => {
  if (!timeStr) return null;
  const [hours, minutes] = timeStr.split(':').map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  return hours * 60 + minutes;
};

const isWithinRange = (nowMinutes, startMinutes, endMinutes) => {
  if (startMinutes === null || endMinutes === null) return false;
  if (startMinutes <= endMinutes) {
    return nowMinutes >= startMinutes && nowMinutes <= endMinutes;
  }
  return nowMinutes >= startMinutes || nowMinutes <= endMinutes;
};

const isScheduleOpen = (schedule, reference = new Date()) => {
  if (!schedule || !schedule.rules) return false;
  const dayLabel = DAY_LABELS[reference.getDay()];
  const rule = schedule.rules[dayLabel];
  if (!rule || !rule.active) return false;
  const startMinutes = toMinutes(rule.start);
  const endMinutes = toMinutes(rule.end);
  const currentMinutes = reference.getHours() * 60 + reference.getMinutes();
  return isWithinRange(currentMinutes, startMinutes, endMinutes);
};

const updateChatById = async (chatId, updater) => {
  const allChats = await adapter.getCollection('activeChats');
  const chatIndex = allChats.findIndex((c) => c.id === chatId);
  if (chatIndex === -1) {
    throw new Error('Chat nao encontrado');
  }
  updater(allChats[chatIndex]);
  allChats[chatIndex].updatedAt = new Date().toISOString();
  await adapter.saveCollection('activeChats', allChats);
  return allChats[chatIndex];
};

const addChatMessage = async (chatId, message) => {
  return updateChatById(chatId, (chat) => {
    if (!Array.isArray(chat.messages)) chat.messages = [];
    chat.messages.push(message);
  });
};

const setChatVars = async (chatId, vars) => {
  return updateChatById(chatId, (chat) => {
    chat.vars = vars;
  });
};

const setCurrentNodeId = async (chatId, nodeId) => {
  return updateChatById(chatId, (chat) => {
    chat.currentNodeId = nodeId;
  });
};

const createMessage = (sender, text, buttons = null) => ({
  id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
  sender,
  text,
  buttons: buttons || null,
  timestamp: new Date().toISOString()
});

export const addBotMessage = async (chatId, text, buttons, sendMessage) => {
  if (!chatId || !text) return null;
  const message = createMessage('bot', text, buttons);
  await addChatMessage(chatId, message);
  if (sendMessage) {
    await sendMessage(text, buttons);
  }
  return message;
};

export const addUserMessage = async (chatId, text) => {
  if (!chatId || !text) return null;
  const message = createMessage('user', text, null);
  await addChatMessage(chatId, message);
  return message;
};

export const runFlow = async ({
  nodeId,
  flowData,
  currentVars,
  chatId,
  templates,
  schedules,
  sendMessage
}) => {
  const node = flowData.nodes.find((n) => n.id === nodeId);
  if (!node) return;
  console.log(`[FLOW] Node ${node.type} (${node.id}) at ${new Date().toISOString()}`);

  const contextWithAlias = resolveVariables(node.data?.varMap, currentVars);

  if (node.type === 'messageNode' || node.type === 'startNode') {
    if (node.data?.text && node.data.text !== 'Início') {
      const text = parseText(node.data.text, contextWithAlias);
      await addBotMessage(chatId, text, null, sendMessage);
    }
    const edge = flowData.edges.find((e) => e.source === nodeId);
    if (edge) {
      await runFlow({
        nodeId: edge.target,
        flowData,
        currentVars,
        chatId,
        templates,
        schedules,
        sendMessage
      });
    }
    return;
  }

  if (node.type === 'inputNode') {
    const questionText = parseText(node.data?.text || 'Digite uma informacao:', currentVars);
    await addBotMessage(chatId, questionText, null, sendMessage);
    await setCurrentNodeId(chatId, node.id);
    return;
  }

  if (node.type === 'ratingNode') {
    const questionText = parseText(node.data?.text || 'Avalie este atendimento de 1 a 5.', contextWithAlias);
    await addBotMessage(chatId, questionText, null, sendMessage);
    await setCurrentNodeId(chatId, node.id);
    return;
  }

  if (node.type === 'templateNode') {
    const templateId = node.data?.templateId;
    let template = templates.find((t) => String(t.id) === String(templateId));
    if (template) {
      const text = parseText(template.text, currentVars);
      await addBotMessage(chatId, text, template.buttons, sendMessage);
      await setCurrentNodeId(chatId, node.id);
    } else {
      if (templateId && adapter?.db) {
        try {
          template = await adapter.db.collection('templates').findOne({ id: String(templateId) });
          if (!template) {
            template = await adapter.db.collection('messageTemplates').findOne({ id: String(templateId) });
          }
        } catch (err) {
          console.warn('[FLOW] Falha ao buscar template direto no Mongo:', err.message);
        }
      }

      if (template) {
        const text = parseText(template.text, currentVars);
        await addBotMessage(chatId, text, template.buttons, sendMessage);
        await setCurrentNodeId(chatId, node.id);
      } else {
        console.warn('[FLOW] Template nao encontrado:', templateId, 'templates carregados:', templates.length);
        await addBotMessage(chatId, 'Template nao encontrado.', null, sendMessage);
      }
    }
    return;
  }

  if (node.type === 'conditionNode') {
    let matchedHandleId = 'else';
    for (const cond of node.data?.conditions || []) {
      const varValue = currentVars[cond.variable] !== undefined ? currentVars[cond.variable] : '';
      const condValue = cond.value;
      let isMatch = false;
      const v1 = String(varValue).trim().toLowerCase();
      const v2 = String(condValue).trim().toLowerCase();
      switch (cond.operator) {
        case '==': isMatch = v1 === v2; break;
        case '!=': isMatch = v1 !== v2; break;
        case '>': isMatch = Number(varValue) > Number(condValue); break;
        case '<': isMatch = Number(varValue) < Number(condValue); break;
        case 'contains': isMatch = v1.includes(v2); break;
        default: isMatch = v1 === v2;
      }
      if (isMatch) {
        matchedHandleId = String(cond.id);
        break;
      }
    }

    const edgesFromNode = flowData.edges.filter((e) => e.source === nodeId);
    const edgeToCase = edgesFromNode.find((e) => String(e.sourceHandle) === String(matchedHandleId));
    if (edgeToCase) {
      const caseNodeId = edgeToCase.target;
      const nextEdge = flowData.edges.find((e) => e.source === caseNodeId);
      if (nextEdge) {
        await runFlow({
          nodeId: nextEdge.target,
          flowData,
          currentVars,
          chatId,
          templates,
          schedules,
          sendMessage
        });
      }
    }
    return;
  }

  if (node.type === 'scriptNode') {
    try {
      const execute = new Function('vars', `${node.data?.script || ''}; return vars;`);
      const updatedVars = execute({ ...currentVars });
      await setChatVars(chatId, updatedVars);
      const edge = flowData.edges.find((e) => e.source === nodeId);
      if (edge) {
        await runFlow({
          nodeId: edge.target,
          flowData,
          currentVars: updatedVars,
          chatId,
          templates,
          schedules,
          sendMessage
        });
      }
    } catch (err) {
      await addBotMessage(chatId, `Erro no script: ${err.message}`, null, sendMessage);
    }
    return;
  }

  if (node.type === 'httpRequestNode') {
    const rawUrl = parseText(node.data?.url, currentVars);
    const url = encodeURI(rawUrl);
    try {
      const method = (node.data?.method || 'GET').toUpperCase();
      let headers = {};
      if (node.data?.headersJson) {
        try {
          headers = JSON.parse(node.data.headersJson);
        } catch (err) {
          throw new Error('Headers JSON inválido');
        }
      }

      let body = null;
      if (node.data?.body && method !== 'GET') {
        body = parseText(node.data.body, currentVars);
        if (!headers['Content-Type']) {
          headers['Content-Type'] = 'application/json';
        }
      }

      const controller = new AbortController();
      const timeoutMs = Number(node.data?.timeoutMs || 10000);
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(url, {
        method,
        headers,
        body: body || undefined,
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      const rawText = await res.text();
      let apiData = null;
      try {
        apiData = JSON.parse(rawText);
      } catch (parseError) {
        if ((node.data?.responseType || 'json') === 'json') {
          throw new Error('Resposta não é JSON válido');
        }
        apiData = { ok: res.ok, rawText };
      }
      let newVars = { ...currentVars };
      if (res.ok && node.data?.mappings) {
        node.data.mappings.forEach((m) => {
          let value = apiData;
          if (m.jsonPath && m.jsonPath !== '.') {
            m.jsonPath.split('.').forEach((key) => { value = value ? value[key] : undefined; });
          }
          if (m.varName) newVars[m.varName] = value;
        });
        await setChatVars(chatId, newVars);
      }
      const status = res.ok ? 'success' : 'error';
      const edge = flowData.edges.find((e) => e.source === nodeId && e.sourceHandle === status);
      if (edge) {
        await runFlow({
          nodeId: edge.target,
          flowData,
          currentVars: newVars,
          chatId,
          templates,
          schedules,
          sendMessage
        });
      } else {
        const fallback = flowData.edges.find((e) => e.source === nodeId);
        console.warn('[FLOW] HTTP sem aresta para status:', status, 'node:', nodeId, 'fallback:', fallback?.target);
        if (fallback) {
          await runFlow({
            nodeId: fallback.target,
            flowData,
            currentVars: newVars,
            chatId,
            templates,
            schedules,
            sendMessage
          });
        }
      }
    } catch (err) {
      console.warn('[FLOW] HTTP request error:', err.message || err, 'url:', url);
      const errorEdge = flowData.edges.find((e) => e.source === nodeId && e.sourceHandle === 'error');
      if (errorEdge) {
        await runFlow({
          nodeId: errorEdge.target,
          flowData,
          currentVars,
          chatId,
          templates,
          schedules,
          sendMessage
        });
      }
    }
    return;
  }

  if (node.type === 'scheduleNode') {
    const schedule = schedules.find((s) => s.id === node.data?.scheduleId);
    const isOpen = isScheduleOpen(schedule);
    const branch = isOpen ? 'inside' : 'outside';
    const childNode = flowData.nodes.find((n) => n.id.startsWith(`child_${nodeId}_${branch}`));
    if (childNode) {
      const nextEdge = flowData.edges.find((e) => e.source === childNode.id);
      if (nextEdge) {
        await runFlow({
          nodeId: nextEdge.target,
          flowData,
          currentVars,
          chatId,
          templates,
          schedules,
          sendMessage
        });
      }
    } else {
      const fallbackEdge = flowData.edges.find((e) => e.source === nodeId);
      if (fallbackEdge) {
        const nextEdge = flowData.edges.find((e) => e.source === fallbackEdge.target);
        if (nextEdge) {
          await runFlow({
            nodeId: nextEdge.target,
            flowData,
            currentVars,
            chatId,
            templates,
            schedules,
            sendMessage
          });
        }
      }
    }
    return;
  }

  if (node.type === 'setValueNode') {
    const newVars = { ...currentVars, [node.data?.variableName]: node.data?.value };
    await setChatVars(chatId, newVars);
    const edge = flowData.edges.find((e) => e.source === nodeId);
    if (edge) {
      await runFlow({
        nodeId: edge.target,
        flowData,
        currentVars: newVars,
        chatId,
        templates,
        schedules,
        sendMessage
      });
    }
    return;
  }

  if (node.type === 'delayNode') {
    const delayMs = (parseInt(node.data?.delay, 10) || 1) * 1000;
    setTimeout(async () => {
      const edge = flowData.edges.find((e) => e.source === nodeId);
      if (edge) {
        await runFlow({
          nodeId: edge.target,
          flowData,
          currentVars,
          chatId,
          templates,
          schedules,
          sendMessage
        });
      }
    }, delayMs);
    return;
  }

  if (node.type === 'gotoNode') {
    const targetAnchorName = node.data?.targetAnchor;
    const anchorNode = flowData.nodes.find(
      (n) => n.type === 'anchorNode' && n.data?.anchorName === targetAnchorName
    );
    if (anchorNode) {
      await runFlow({
        nodeId: anchorNode.id,
        flowData,
        currentVars,
        chatId,
        templates,
        schedules,
        sendMessage
      });
    } else {
      await addBotMessage(chatId, `Erro: Ancora "${targetAnchorName}" nao encontrada.`, null, sendMessage);
    }
    return;
  }

  if (node.type === 'anchorNode') {
    const edge = flowData.edges.find((e) => e.source === nodeId);
    if (edge) {
      await runFlow({
        nodeId: edge.target,
        flowData,
        currentVars,
        chatId,
        templates,
        schedules,
        sendMessage
      });
    }
    return;
  }

  if (node.type === 'caseNode') {
    const edge = flowData.edges.find((e) => e.source === nodeId);
    if (edge) {
      await runFlow({
        nodeId: edge.target,
        flowData,
        currentVars,
        chatId,
        templates,
        schedules,
        sendMessage
      });
    }
    return;
  }

  if (node.type === 'queueNode') {
    const waitMessage = node.data?.queueMessage || 'Aguarde, em alguns instantes um especialista deve te atender.';
    await addBotMessage(chatId, waitMessage, null, sendMessage);
    const nextEdge = flowData.edges.find((e) => e.source === nodeId);
    const resumeNodeId = nextEdge ? nextEdge.target : null;
    await updateChatById(chatId, (chat) => {
      chat.status = 'waiting';
      chat.queue = node.data?.queueName || 'default';
      chat.waitingSince = new Date().toISOString();
      chat.continueFlowAfterQueue = node.data?.continueFlowAfterQueue ?? true;
      chat.resumeNodeId = resumeNodeId;
      chat.resumePending = false;
    });
    return;
  }

  if (node.type === 'endNode' || node.type === 'finalNode') {
    const finalMessage = node.data?.text || 'Atendimento finalizado. Obrigado!';
    await addBotMessage(chatId, finalMessage, null, sendMessage);
    await updateChatById(chatId, (chat) => {
      chat.status = 'closed';
      chat.closedAt = new Date().toISOString();
      chat.currentNodeId = null;
    });
    try {
      const chat = await getChatById(chatId);
      if (chat?.agentId && chat.vars) {
        const ratingValue = Number(chat.vars.nota ?? chat.vars.rating ?? chat.vars.avaliacao);
        if (Number.isFinite(ratingValue) && ratingValue >= 1 && ratingValue <= 5) {
          const users = await adapter.getCollection('users');
          const userIndex = users.findIndex((u) => u.id === chat.agentId);
          if (userIndex !== -1) {
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
            console.log(`[RATING] Agent ${user.id} (${user.name}) -> +${ratingValue}, avg ${ratingAvg.toFixed(2)} (${ratingCount})`);
          }
        }
      }
    } catch (err) {
      console.warn('[RATING] Falha ao atualizar rating:', err.message);
    }
    return;
  }
};

export const applyUserInput = async ({
  chat,
  flowData,
  text,
  buttonId,
  templates,
  schedules,
  sendMessage
}) => {
  if (!chat?.currentNodeId) return;
  const node = flowData.nodes.find((n) => n.id === chat.currentNodeId);
  if (!node) return;
  console.log(`[FLOW] User input on ${node.type} (${node.id}) at ${new Date().toISOString()}`);

  const currentVars = chat.vars || {};

  if (node.type === 'ratingNode') {
    const answered = (text || '').trim();
    if (!/^[1-5]$/.test(answered)) {
      const errorMessage = node.data?.errorText || 'Digite um numero entre 1 e 5.';
      await addBotMessage(chat.id, errorMessage, null, sendMessage);
      return;
    }
    const varName = node.data?.variableName || 'nota';
    const ratingValue = Number(answered);
    const newVars = { ...currentVars, [varName]: ratingValue };
    await setChatVars(chat.id, newVars);
    const edge = flowData.edges.find((e) => e.source === node.id);
    if (edge) {
      await setCurrentNodeId(chat.id, null);
      await runFlow({
        nodeId: edge.target,
        flowData,
        currentVars: newVars,
        chatId: chat.id,
        templates,
        schedules,
        sendMessage
      });
    }
    return;
  }

  if (node.type === 'inputNode') {
    const varName = node.data?.variableName;
    if (!varName) {
      await addBotMessage(chat.id, 'Erro: este no de input nao tem variavel configurada.', null, sendMessage);
      return;
    }
    const newVars = { ...currentVars, [varName]: text };
    await setChatVars(chat.id, newVars);
    const edge = flowData.edges.find((e) => e.source === node.id);
    if (edge) {
      console.log(`[FLOW] Input edge -> ${edge.target}`);
      await setCurrentNodeId(chat.id, null);
      await runFlow({
        nodeId: edge.target,
        flowData,
        currentVars: newVars,
        chatId: chat.id,
        templates,
        schedules,
        sendMessage
      });
    }
    return;
  }

  if (node.type === 'templateNode') {
    if (!buttonId) {
      await addBotMessage(chat.id, 'Use os botoes para responder.', null, sendMessage);
      return;
    }
    console.log('[FLOW] Template click:', {
      nodeId: node.id,
      buttonId,
      edges: flowData.edges.filter((e) => e.source === node.id).map((e) => ({
        id: e.id,
        sourceHandle: e.sourceHandle,
        target: e.target
      }))
    });
    let edgeToCase = flowData.edges.find(
      (e) => e.source === node.id && String(e.sourceHandle) === String(buttonId)
    );
    if (!edgeToCase) {
      console.warn('[FLOW] Nao encontrou aresta para botao:', buttonId, 'node:', node.id);
      edgeToCase = flowData.edges.find((e) => e.source === node.id);
    }
    if (edgeToCase) {
      const caseNodeId = edgeToCase.target;
      const edgeFromCase = flowData.edges.find((e) => e.source === caseNodeId);
      if (edgeFromCase) {
        await setCurrentNodeId(chat.id, null);
        await runFlow({
          nodeId: edgeFromCase.target,
          flowData,
          currentVars,
          chatId: chat.id,
          templates,
          schedules,
          sendMessage
        });
      }
    }
  }
};

export const getChatById = async (chatId) => {
  const allChats = await adapter.getCollection('activeChats');
  return allChats.find((c) => c.id === chatId) || null;
};

export const startChatFlow = async ({ chatId, flowData, templates, schedules, sendMessage }) => {
  try {
    await updateChatById(chatId, (chat) => {
      chat.flowStarted = true;
    });
  } catch (err) {
    // ignore
  }
  const startNode = flowData.nodes.find((n) => n.type === 'startNode');
  if (startNode) {
    await runFlow({
      nodeId: startNode.id,
      flowData,
      currentVars: {},
      chatId,
      templates,
      schedules,
      sendMessage
    });
  }
};
