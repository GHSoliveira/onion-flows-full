import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { authorize, requireSuperAdminPermission } from '../middleware/authorization.js';
import adapter from '../../db/DatabaseAdapter.js';
import { getTenantSettings, getUsageCounts } from '../services/tenantLimits.js';

const router = express.Router();
const METRICS_CACHE_TTL_MS = 15000;
const MONITOR_CACHE_TTL_MS = 10000;
let cachedMetrics = null;
let cachedMetricsAt = 0;
let cachedMonitoring = null;
let cachedMonitoringAt = 0;

router.get('/dashboard', authenticate, authorize(['SUPER_ADMIN']), requireSuperAdminPermission(['superadmin:read']), async (req, res) => {
  try {
    if (cachedMetrics && Date.now() - cachedMetricsAt < METRICS_CACHE_TTL_MS) {
      res.set('Cache-Control', 'private, max-age=10');
      return res.json(cachedMetrics);
    }

    const [tenants, users, flows, activeChats] = await Promise.all([
      adapter.getCollection('tenants'),
      adapter.getCollection('users'),
      adapter.getCollection('flows'),
      adapter.getCollection('activeChats')
    ]);

    const billing = await Promise.all(
      (tenants || []).map(async (tenant) => {
        const [usage, limits] = await Promise.all([
          getUsageCounts(tenant.id),
          getTenantSettings(tenant.id)
        ]);
        return {
          tenantId: tenant.id,
          name: tenant.name,
          plan: tenant.plan || 'free',
          status: tenant.status || 'active',
          usage,
          limits
        };
      })
    );

    const metrics = {
      tenants: {
        total: tenants.length,
        ativos: tenants.filter(t => t.status === 'active').length,
        trial: tenants.filter(t => t.status === 'trial').length,
        suspensos: tenants.filter(t => t.status === 'suspended').length
      },
      usuarios: {
        total: users.length,
        porTenant: users.reduce((acc, user) => {
          const existing = acc.find(a => a.tenantId === user.tenantId);
          if (existing) {
            existing.count++;
          } else {
            acc.push({ tenantId: user.tenantId || 'super_admin', count: 1 });
          }
          return acc;
        }, [])
      },
      flows: {
        total: flows.length,
        porTenant: flows.reduce((acc, flow) => {
          const existing = acc.find(a => a.tenantId === flow.tenantId);
          if (existing) {
            existing.count++;
          } else {
            acc.push({ tenantId: flow.tenantId || 'super_admin', count: 1 });
          }
          return acc;
        }, [])
      },
      chats: {
        total: activeChats.length,
        porTenant: activeChats.reduce((acc, chat) => {
          const existing = acc.find(a => a.tenantId === chat.tenantId);
          if (existing) {
            existing.count++;
          } else {
            acc.push({ tenantId: chat.tenantId || 'super_admin', count: 1 });
          }
          return acc;
        }, [])
      },
      billing
    };

    cachedMetrics = metrics;
    cachedMetricsAt = Date.now();
    res.set('Cache-Control', 'private, max-age=10');
    res.json(metrics);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const buildTelegramStatus = (telegram) => {
  const enabled = Boolean(telegram?.enabled);
  if (!enabled) {
    return { status: 'disabled', enabled };
  }

  const missing = [];
  if (!telegram?.botToken) missing.push('botToken');
  if (!telegram?.flowId) missing.push('flowId');
  if (!telegram?.usePolling && !telegram?.webhookUrl) missing.push('webhookUrl');

  return {
    status: missing.length ? 'misconfigured' : 'ok',
    enabled,
    missing,
    updatedAt: telegram?.updatedAt || null
  };
};

const buildWhatsAppStatus = (whatsapp) => {
  const enabled = Boolean(whatsapp?.enabled);
  if (!enabled) {
    return { status: 'disabled', enabled };
  }

  const missing = [];
  if (!whatsapp?.accessToken) missing.push('accessToken');
  if (!whatsapp?.phoneNumberId) missing.push('phoneNumberId');
  if (!whatsapp?.flowId) missing.push('flowId');
  if (!whatsapp?.webhookVerifyToken) missing.push('webhookVerifyToken');

  return {
    status: missing.length ? 'misconfigured' : 'ok',
    enabled,
    missing,
    updatedAt: whatsapp?.updatedAt || null
  };
};

router.get('/monitoring', authenticate, authorize(['SUPER_ADMIN']), requireSuperAdminPermission(['superadmin:monitor']), async (req, res) => {
  try {
    if (cachedMonitoring && Date.now() - cachedMonitoringAt < MONITOR_CACHE_TTL_MS) {
      res.set('Cache-Control', 'private, max-age=5');
      return res.json(cachedMonitoring);
    }

    const [tenants, channelConfigs, queues, activeChats] = await Promise.all([
      adapter.getCollection('tenants'),
      adapter.getCollection('channelConfigs'),
      adapter.getCollection('queues'),
      adapter.getCollection('activeChats')
    ]);

    let dbStatus = { ok: false, error: null };
    try {
      if (!adapter.db) await adapter.init();
      await adapter.db.collection('tenants').findOne({}, { projection: { _id: 1 } });
      dbStatus = { ok: true, error: null };
    } catch (err) {
      dbStatus = { ok: false, error: err?.message || 'db_error' };
    }

    const chatList = Array.isArray(activeChats) ? activeChats : [];
    const waitingChats = chatList.filter(c => c.status === 'waiting').length;
    const chatsByChannel = chatList.reduce((acc, chat) => {
      const key = chat.channel || 'unknown';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    const configByTenant = new Map(
      (channelConfigs || []).map(cfg => [cfg.tenantId, cfg])
    );

    const channelTenants = (tenants || []).map((tenant) => {
      const config = configByTenant.get(tenant.id) || {};
      const telegram = buildTelegramStatus(config.telegram);
      const whatsapp = buildWhatsAppStatus(config.whatsapp);
      const alerts = [];

      if (telegram.status === 'misconfigured') {
        alerts.push(`Telegram faltando: ${telegram.missing.join(', ')}`);
      }
      if (whatsapp.status === 'misconfigured') {
        alerts.push(`WhatsApp faltando: ${whatsapp.missing.join(', ')}`);
      }

      return {
        tenantId: tenant.id,
        name: tenant.name,
        telegram,
        whatsapp,
        alerts
      };
    });

    const payload = {
      timestamp: new Date().toISOString(),
      server: {
        uptimeSec: Math.round(process.uptime()),
        memory: {
          rss: process.memoryUsage().rss,
          heapUsed: process.memoryUsage().heapUsed,
          heapTotal: process.memoryUsage().heapTotal
        }
      },
      database: dbStatus,
      queues: {
        totalQueues: Array.isArray(queues) ? queues.length : 0,
        waitingChats,
        activeChats: chatList.length,
        chatsByChannel
      },
      channels: {
        tenants: channelTenants
      }
    };

    cachedMonitoring = payload;
    cachedMonitoringAt = Date.now();
    res.set('Cache-Control', 'private, max-age=5');
    res.json(payload);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const buildMetricsSummary = (metrics) => {
  const values = (metrics || []).map((m) => Number(m.value)).filter((v) => Number.isFinite(v));
  if (!values.length) {
    return { count: 0, avg: null, p75: null, p95: null };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const sum = values.reduce((acc, v) => acc + v, 0);
  const p75 = sorted[Math.floor((sorted.length - 1) * 0.75)];
  const p95 = sorted[Math.floor((sorted.length - 1) * 0.95)];
  return {
    count: values.length,
    avg: Number((sum / values.length).toFixed(2)),
    p75: Number(p75.toFixed(2)),
    p95: Number(p95.toFixed(2))
  };
};

router.get('/web-vitals', authenticate, authorize(['SUPER_ADMIN']), requireSuperAdminPermission(['superadmin:monitor']), async (req, res) => {
  try {
    const days = Math.min(Math.max(parseInt(req.query.days || '7', 10) || 7, 1), 30);
    const since = Date.now() - days * 24 * 60 * 60 * 1000;

    const all = await adapter.getCollection('webVitals');
    const filtered = (all || []).filter((m) => {
      const ts = new Date(m.timestamp || 0).getTime();
      return ts >= since;
    });

    const byMetric = filtered.reduce((acc, m) => {
      const key = m.name || 'unknown';
      if (!acc[key]) acc[key] = [];
      acc[key].push(m);
      return acc;
    }, {});

    const summary = Object.entries(byMetric).reduce((acc, [name, list]) => {
      acc[name] = buildMetricsSummary(list);
      return acc;
    }, {});

    const byPage = filtered.reduce((acc, m) => {
      const page = m.page || '/';
      if (!acc[page]) acc[page] = [];
      acc[page].push(m);
      return acc;
    }, {});

    const pageSummary = Object.entries(byPage)
      .map(([page, list]) => {
        const group = list.reduce((acc, m) => {
          if (!acc[m.name]) acc[m.name] = [];
          acc[m.name].push(m);
          return acc;
        }, {});
        return {
          page,
          metrics: Object.entries(group).reduce((acc, [name, items]) => {
            acc[name] = buildMetricsSummary(items);
            return acc;
          }, {})
        };
      })
      .sort((a, b) => a.page.localeCompare(b.page));

    res.json({
      days,
      totalSamples: filtered.length,
      summary,
      pages: pageSummary
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/web-vitals/export', authenticate, authorize(['SUPER_ADMIN']), requireSuperAdminPermission(['superadmin:monitor']), async (req, res) => {
  try {
    const days = Math.min(Math.max(parseInt(req.query.days || '7', 10) || 7, 1), 30);
    const since = Date.now() - days * 24 * 60 * 60 * 1000;

    const all = await adapter.getCollection('webVitals');
    const filtered = (all || []).filter((m) => {
      const ts = new Date(m.timestamp || 0).getTime();
      return ts >= since;
    });

    const header = [
      'timestamp',
      'name',
      'value',
      'rating',
      'delta',
      'navigationType',
      'page',
      'userId',
      'tenantId'
    ];

    const rows = filtered.map((m) => [
      m.timestamp || '',
      m.name || '',
      m.value ?? '',
      m.rating || '',
      m.delta ?? '',
      m.navigationType || '',
      m.page || '',
      m.userId || '',
      m.tenantId || ''
    ]);

    const csv = [header, ...rows]
      .map((row) => row.map((cell) => {
        const text = String(cell ?? '');
        if (text.includes(',') || text.includes('"') || text.includes('\n')) {
          return `"${text.replace(/"/g, '""')}"`;
        }
        return text;
      }).join(','))
      .join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=\"web-vitals-${days}d.csv\"`);
    res.send(csv);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
