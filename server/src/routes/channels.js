import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { authorize } from '../middleware/authorization.js';
import { requireTenant } from '../middleware/tenant.js';
import { getChannelConfig, saveTelegramConfig, saveWhatsAppConfig } from '../services/channelConfig.js';
import { telegramFetch } from '../services/telegramApi.js';

const router = express.Router();

router.get('/', authenticate, requireTenant, async (req, res) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId || null;
    if (!tenantId) {
      return res.status(400).json({ error: 'tenantId obrigatorio' });
    }
    const config = await getChannelConfig(tenantId);
    res.json(config || { tenantId, telegram: null, whatsapp: null });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/telegram', authenticate, authorize(['ADMIN', 'MANAGER']), requireTenant, async (req, res) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId || null;
    if (!tenantId) {
      return res.status(400).json({ error: 'tenantId obrigatorio' });
    }
    const saved = await saveTelegramConfig(tenantId, req.body || {});
    res.json({ tenantId, telegram: saved });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/whatsapp', authenticate, authorize(['ADMIN', 'MANAGER']), requireTenant, async (req, res) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId || null;
    if (!tenantId) {
      return res.status(400).json({ error: 'tenantId obrigatorio' });
    }
    const saved = await saveWhatsAppConfig(tenantId, req.body || {});
    res.json({ tenantId, whatsapp: saved });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/telegram/webhook', authenticate, authorize(['ADMIN', 'MANAGER']), requireTenant, async (req, res) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId || null;
    if (!tenantId) {
      return res.status(400).json({ error: 'tenantId obrigatorio' });
    }
    const config = await getChannelConfig(tenantId);
    const telegram = config?.telegram || null;
    if (!telegram?.botToken || !telegram?.webhookUrl) {
      return res.status(400).json({ error: 'Bot token e webhook URL sao obrigatorios' });
    }

    const payload = {
      url: telegram.webhookUrl,
      secret_token: telegram.webhookSecret || undefined
    };
    const result = await telegramFetch('setWebhook', payload, telegram.botToken);
    res.json({ ok: true, result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
