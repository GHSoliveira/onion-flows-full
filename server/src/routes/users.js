import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { authorize } from '../middleware/authorization.js';
import { requireTenant } from '../middleware/tenant.js';
import adapter from '../../db/DatabaseAdapter.js';
import { userSchema } from '../schemas/index.js';
import { createLog } from '../services/logs.js';
import { ensureTenantLimit } from '../services/tenantLimits.js';

const router = express.Router();

router.get('/', authenticate, requireTenant, async (req, res) => {
  try {
    const users = await adapter.getCollection('users', req.tenantId);
    const usersWithoutPasswords = users.map(({ password, ...user }) => user);
    const page = Math.max(parseInt(req.query.page || '1', 10) || 1, 1);
    const limitRaw = parseInt(req.query.limit || '0', 10) || 0;
    const limit = limitRaw > 0 ? Math.min(Math.max(limitRaw, 1), 500) : 0;

    if (!limit) {
      return res.json(usersWithoutPasswords);
    }

    const total = usersWithoutPasswords?.length || 0;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const start = (page - 1) * limit;
    const items = (usersWithoutPasswords || []).slice(start, start + limit);
    res.json({ items, total, page, totalPages, limit });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', authenticate, authorize(['ADMIN', 'SUPER_ADMIN']), requireTenant, async (req, res) => {
  try {
    const { name, username, password, role, queues, tenantId: bodyTenantId, permissions } = userSchema.parse(req.body);
    const tenantId = req.user.role === 'SUPER_ADMIN'
      ? (bodyTenantId || req.tenantId || req.user.tenantId)
      : req.tenantId;

    if (!tenantId && req.user.role !== 'SUPER_ADMIN') {
      return res.status(400).json({ error: 'Administrador deve pertencer a um tenant' });
    }

    await ensureTenantLimit(tenantId, 'users');
    const users = await adapter.getCollection('users', tenantId);

    if (users.find(u => u.username === username)) {
      return res.status(400).json({ error: 'Username já está em uso' });
    }

    const user = {
      id: `u_${Date.now()}`,
      name,
      username,
      password,
      role: req.user.role === 'SUPER_ADMIN' && role === 'SUPER_ADMIN' ? 'SUPER_ADMIN' : role || 'AGENT',
      queues: queues || [],
      permissions: req.user.role === 'SUPER_ADMIN' ? (permissions || []) : [],
      tenantId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: req.user.id
    };

    const allUsers = await adapter.getCollection('users');
    allUsers.push(user);
    await adapter.saveCollection('users', allUsers);

    await createLog('USER_CREATE', { id: user.id, name: user.name, tenantId: user.tenantId, role: user.role }, req.user.id);
    const { password: _, ...userWithoutPassword } = user;
    res.status(201).json(userWithoutPassword);
  } catch (error) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: error.errors });
    }
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', authenticate, authorize(['ADMIN', 'SUPER_ADMIN']), async (req, res) => {
  try {
    const users = await adapter.getCollection('users');
    const user = users.find(u => u.id === req.params.id);

    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

    const tenantId = req.user.tenantId;

    if (req.user.role !== 'SUPER_ADMIN' && user.tenantId !== tenantId) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    // Usar deleteOne diretamente para persistir no MongoDB
    if (!adapter.db) await adapter.init();
    const collection = adapter.db.collection('users');
    await collection.deleteOne({ id: req.params.id });

    await createLog('USER_DELETE', { id: user.id, name: user.name, tenantId: user.tenantId, role: user.role }, req.user.id);
    const { password: _, ...userWithoutPassword } = user;
    res.json({ message: 'Usuário removido', deleted: userWithoutPassword });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id/permissions', authenticate, authorize(['SUPER_ADMIN']), async (req, res) => {
  try {
    const { permissions } = req.body || {};
    if (!Array.isArray(permissions)) {
      return res.status(400).json({ error: 'permissions deve ser um array' });
    }

    const users = await adapter.getCollection('users');
    const userIndex = users.findIndex(u => u.id === req.params.id);
    if (userIndex === -1) return res.status(404).json({ error: 'UsuÃ¡rio nÃ£o encontrado' });

    if (users[userIndex].role !== 'SUPER_ADMIN') {
      return res.status(400).json({ error: 'Somente SUPER_ADMIN pode ter permissÃµes globais' });
    }

    users[userIndex] = {
      ...users[userIndex],
      permissions,
      updatedAt: new Date().toISOString()
    };

    await adapter.saveCollection('users', users);
    res.json({ id: users[userIndex].id, permissions: users[userIndex].permissions || [] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
