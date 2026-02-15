const resolveToken = (token) => token || process.env.TELEGRAM_BOT_TOKEN;

const getApiBase = (token) => {
  const resolved = resolveToken(token);
  return resolved ? `https://api.telegram.org/bot${resolved}` : null;
};

export const telegramFetch = async (method, body, token) => {
  const apiBase = getApiBase(token);
  if (!apiBase) {
    throw new Error('TELEGRAM_BOT_TOKEN nao definido');
  }
  const res = await fetch(`${apiBase}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  if (!data.ok) {
    throw new Error(data.description || `Erro Telegram: ${res.status}`);
  }
  return data.result;
};

export const sendTelegramMessage = async (chatId, text, buttons = null, token = null) => {
  const payload = {
    chat_id: chatId,
    text: text || ''
  };

  if (buttons && Array.isArray(buttons) && buttons.length > 0) {
    payload.reply_markup = {
      inline_keyboard: buttons.map((b) => ([
        { text: b.label || 'Opcao', callback_data: String(b.id) }
      ]))
    };
  }

  return telegramFetch('sendMessage', payload, token);
};

export const answerCallbackQuery = async (callbackQueryId, token = null) => {
  return telegramFetch('answerCallbackQuery', { callback_query_id: callbackQueryId }, token);
};

export const getUpdates = async (token, offset) => {
  const payload = { timeout: 25 };
  if (offset) payload.offset = offset;
  return telegramFetch('getUpdates', payload, token);
};
