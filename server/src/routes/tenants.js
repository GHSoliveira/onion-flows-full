import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { getTenantAnalytics } from '../services/analytics.js';
import { getTenantSettings, saveTenantSettings } from '../services/tenantSettings.js';
import { authorize, requireSuperAdminPermission } from '../middleware/authorization.js';
import adapter from '../../db/DatabaseAdapter.js';
import { getOnlineUserIds } from '../services/userStatus.js';
import { createLog } from '../services/logs.js';
import { invalidateTenantCache } from '../services/tenantLimits.js';

const router = express.Router();

const buildTenantResponse = (tenant, role = 'ADMIN') => ({
  ...tenant,
  role
});

router.get('/', authenticate, authorize(['SUPER_ADMIN']), requireSuperAdminPermission(['tenants:read']), async (req, res) => {
  try {
    const tenants = await adapter.getCollection('tenants');
    res.json(tenants);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', authenticate, authorize(['SUPER_ADMIN']), requireSuperAdminPermission(['tenants:write']), async (req, res) => {
  try {
    const { name, slug, plan, status, settings } = req.body;
    const tenant = {
      id: `tenant_${Date.now()}`,
      name,
      slug: slug || '',
      plan: plan || 'free',
      status: status || 'active',
      settings: settings || {
        maxUsers: 5,
        maxFlows: 10,
        maxChatsPerDay: 100
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const tenants = await adapter.getCollection('tenants');
    tenants.push(tenant);
    await adapter.saveCollection('tenants', tenants);
    invalidateTenantCache();

    res.status(201).json(tenant);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:tenantId/users', authenticate, async (req, res) => {
  try {
    const { tenantId } = req.params;
    if (req.user.role !== 'SUPER_ADMIN' && req.user.tenantId !== tenantId) {
      return res.status(403).json({ error: 'Acesso negado' });
    }
    const users = await adapter.getCollection('users', tenantId);
    const onlineIds = getOnlineUserIds();
    const usersWithoutPasswords = users.map(({ password, ...user }) => ({
      ...user,
      isOnline: onlineIds.has(user.id) || user.status === 'online'
    }));
    res.json(usersWithoutPasswords);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:tenantId/analytics', authenticate, async (req, res) => {
  try {
    const { tenantId } = req.params;

    if (req.user.role !== 'SUPER_ADMIN' && req.user.tenantId !== tenantId) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const analytics = await getTenantAnalytics(tenantId);

    if (!analytics) {
      return res.status(404).json({ error: 'Tenant não encontrado' });
    }

    res.json(analytics);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:tenantId/chats', authenticate, async (req, res) => {
  try {
    const { tenantId } = req.params;

    if (req.user.role !== 'SUPER_ADMIN' && req.user.tenantId !== tenantId) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const chats = await adapter.getCollection('activeChats', tenantId);
    res.json(chats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:tenantId/settings', authenticate, async (req, res) => {
  try {
    const { tenantId } = req.params;
    if (req.user.role !== 'SUPER_ADMIN' && req.user.tenantId !== tenantId) {
      return res.status(403).json({ error: 'Acesso negado' });
    }
    const settings = await getTenantSettings(tenantId);
    res.json(settings || { tenantId, agentViewVars: [] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:tenantId/settings', authenticate, authorize(['ADMIN', 'MANAGER']), async (req, res) => {
  try {
    const { tenantId } = req.params;
    if (req.user.role !== 'SUPER_ADMIN' && req.user.tenantId !== tenantId) {
      return res.status(403).json({ error: 'Acesso negado' });
    }
    const saved = await saveTenantSettings(tenantId, req.body || {});
    res.json(saved || { tenantId, agentViewVars: [] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:tenantId/switch', authenticate, authorize(['SUPER_ADMIN']), requireSuperAdminPermission(['tenants:switch']), async (req, res) => {
  try {
    if (req.user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const { tenantId } = req.params;
    const tenants = await adapter.getCollection('tenants');
    const tenant = tenants.find(t => t.id === tenantId);

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant não encontrado' });
    }

    res.json({
      id: tenant.id,
      name: tenant.name,
      role: req.user.role
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const tenantCurrentHandler = async (req, res) => {
  try {
    if (req.user.role === 'SUPER_ADMIN') {
      const tenants = await adapter.getCollection('tenants');
      if (tenants.length === 0) {
        return res.json({ id: 'super_admin', name: 'Super Admin', role: 'SUPER_ADMIN' });
      }
      return res.json({ id: 'super_admin', name: 'Super Admin', role: 'SUPER_ADMIN', tenants: tenants.length });
    }

    const tenants = await adapter.getCollection('tenants');
    const tenant = tenants.find(t => t.id === req.user.tenantId);
    res.json(tenant ? buildTenantResponse(tenant, req.user.role) : { id: 'unknown', name: 'Unknown' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

router.get('/tenant/current', authenticate, tenantCurrentHandler);

router.put('/:tenantId', authenticate, authorize(['SUPER_ADMIN']), requireSuperAdminPermission(['tenants:write']), async (req, res) => {
  try {
    const { tenantId } = req.params;
    const tenants = await adapter.getCollection('tenants');
    const tenantIndex = tenants.findIndex(t => t.id === tenantId);
    if (tenantIndex === -1) {
      return res.status(404).json({ error: 'Tenant não encontrado' });
    }

    const updates = {
      name: req.body.name,
      slug: req.body.slug,
      plan: req.body.plan,
      status: req.body.status,
      settings: req.body.settings
    };

    const updatedTenant = {
      ...tenants[tenantIndex],
      ...Object.entries(updates).reduce((acc, [key, value]) => value !== undefined ? { ...acc, [key]: value } : acc, {}),
      updatedAt: new Date().toISOString()
    };

    if (!adapter.db) await adapter.init();
    const collection = adapter.db.collection('tenants');
    await collection.updateOne({ id: tenantId }, { $set: updatedTenant });
    invalidateTenantCache();

    res.json(updatedTenant);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:tenantId', authenticate, authorize(['SUPER_ADMIN']), requireSuperAdminPermission(['tenants:delete']), async (req, res) => {
  try {
    const { tenantId } = req.params;
    const confirm = req.body?.confirm === true || req.body?.confirm === 'true';
    const reason = String(req.body?.reason || '').trim();
    if (!confirm || reason.length < 3) {
      return res.status(400).json({ error: 'ConfirmaÃ§Ã£o e motivo sÃ£o obrigatÃ³rios' });
    }
    const tenants = await adapter.getCollection('tenants');
    const tenant = tenants.find(t => t.id === tenantId);
    if (!tenant) {
      return res.status(404).json({ error: 'Tenant não encontrado' });
    }

    if (!adapter.db) await adapter.init();
    const collection = adapter.db.collection('tenants');
    await collection.deleteOne({ id: tenantId });
    invalidateTenantCache();

    await createLog(
      'TENANT_DELETE',
      { tenantId: tenant.id, name: tenant.name, reason },
      req.user?.id || 'system'
    );

    res.json({ message: 'Tenant removido', deleted: tenant });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
export { tenantCurrentHandler };
