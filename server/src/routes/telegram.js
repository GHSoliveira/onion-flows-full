import express from 'express';
import { handleTelegramUpdate } from '../services/telegramHandler.js';
import { getTelegramConfig } from '../services/channelConfig.js';

const router = express.Router();

router.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

const handleWebhook = async (req, res, tenantId = null) => {
  try {
    const config = tenantId ? await getTelegramConfig(tenantId) : null;
    const secretHeader = req.headers['x-telegram-bot-api-secret-token'];
    const expectedSecret = config?.webhookSecret || process.env.TELEGRAM_WEBHOOK_SECRET || null;
    if (expectedSecret && secretHeader !== expectedSecret) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    await handleTelegramUpdate(req.body, config ? {
      tenantId,
      flowId: config.flowId || null,
      botToken: config.botToken || null
    } : null);
    res.json({ ok: true });
  } catch (error) {
    console.error('Erro Telegram webhook:', error);
    res.status(500).json({ error: 'internal_error' });
  }
};

router.post('/webhook', async (req, res) => {
  const tenantId = req.query.tenantId || null;
  return handleWebhook(req, res, tenantId);
});

router.post('/webhook/:tenantId', async (req, res) => {
  const { tenantId } = req.params;
  return handleWebhook(req, res, tenantId);
});

export default router;
