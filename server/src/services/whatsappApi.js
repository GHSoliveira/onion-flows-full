import crypto from 'crypto';

const getGraphVersion = () => process.env.WHATSAPP_GRAPH_VERSION || 'v21.0';

const buildUrl = (phoneNumberId, endpoint) => {
  const version = getGraphVersion();
  return `https://graph.facebook.com/${version}/${phoneNumberId}/${endpoint}`;
};

export const verifyWhatsAppSignature = (rawBody, signatureHeader, appSecret) => {
  if (!appSecret) return false;
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) return false;
  const signature = signatureHeader.replace('sha256=', '');
  const expected = crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
};

export const sendWhatsAppText = async ({ accessToken, phoneNumberId, to, text }) => {
  if (!accessToken || !phoneNumberId || !to || !text) {
    throw new Error('Parâmetros inválidos para envio WhatsApp');
  }
  const url = buildUrl(phoneNumberId, 'messages');
  const payload = {
    messaging_product: 'whatsapp',
    to,
    type: 'text',
    text: { body: text }
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify(payload)
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = data?.error?.message || `Falha ao enviar WhatsApp (${res.status})`;
    console.error('[WHATSAPP] Send error', { status: res.status, data });
    throw new Error(message);
  }
  console.log('[WHATSAPP] Send ok', { to, messageId: data?.messages?.[0]?.id || null });
  return data;
};
