import express from 'express';
import { handleWhatsAppWebhook } from '../services/whatsappHandler.js';
import { getWhatsAppConfig } from '../services/channelConfig.js';
import { verifyWhatsAppSignature } from '../services/whatsappApi.js';

const router = express.Router();

router.get('/webhook', async (req, res) => {
  try {
    const tenantId = req.query.tenantId || null;
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (!mode || !token || !challenge) {
      return res.status(400).send('Missing verification params');
    }

    const config = tenantId ? await getWhatsAppConfig(tenantId) : null;
    const expected = config?.webhookVerifyToken || process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || null;
    if (mode === 'subscribe' && expected && token === expected) {
      return res.status(200).send(challenge);
    }

    return res.status(403).send('Forbidden');
  } catch (error) {
    return res.status(500).send('Internal error');
  }
});

router.post('/webhook', async (req, res) => {
  try {
    const tenantId = req.query.tenantId || null;
    const rawBody = req.rawBody ? req.rawBody : Buffer.from(JSON.stringify(req.body || {}));

    const config = tenantId ? await getWhatsAppConfig(tenantId) : null;
    const appSecret = config?.appSecret || process.env.WHATSAPP_APP_SECRET || null;
    const signature = req.headers['x-hub-signature-256'];
    if (appSecret) {
      const isValid = verifyWhatsAppSignature(rawBody, signature, appSecret);
      if (!isValid) {
        return res.status(401).json({ error: 'Invalid signature' });
      }
    }

    const payload = Buffer.isBuffer(req.body) ? JSON.parse(req.body.toString('utf8')) : req.body;
    const result = await handleWhatsAppWebhook({ payload, tenantId });
    return res.json(result);
  } catch (error) {
    console.error('Erro webhook WhatsApp:', error);
    return res.status(500).json({ error: 'internal_error' });
  }
});

export default router;
