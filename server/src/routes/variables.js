import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { authorize } from '../middleware/authorization.js';
import { requireTenant } from '../middleware/tenant.js';
import adapter from '../../db/DatabaseAdapter.js';
import { variableSchema } from '../schemas/index.js';
import { createLog } from '../services/logs.js';

const router = express.Router();

router.get('/', authenticate, requireTenant, async (req, res) => {
  try {
    const variables = await adapter.getCollection('variables', req.tenantId);
    res.json(variables);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', authenticate, authorize(['ADMIN', 'MANAGER', 'SUPER_ADMIN']), requireTenant, async (req, res) => {
  try {
    const data = variableSchema.parse(req.body);

    const tenantId = req.user.role === 'SUPER_ADMIN'
      ? (req.body.tenantId || req.tenantId)
      : req.tenantId;

    const variable = {
      id: `var_${Date.now()}`,
      ...data,
      isRoot: data.isRoot === true,
      enabled: data.enabled !== false,
      tenantId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const variables = await adapter.getCollection('variables');
    variables.push(variable);
    await adapter.saveCollection('variables', variables);
    await createLog('VARIABLE_CREATE', { id: variable.id, name: variable.name, tenantId: variable.tenantId }, req.user.id);
    res.status(201).json(variable);
  } catch (error) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: error.errors });
    }
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id', authenticate, authorize(['ADMIN', 'MANAGER', 'SUPER_ADMIN']), requireTenant, async (req, res) => {
  try {
    const variables = await adapter.getCollection('variables');
    const index = variables.findIndex(v => v.id === req.params.id);

    if (index === -1) return res.status(404).json({ error: 'Variável não encontrada' });

    const variable = variables[index];

    if (req.user.role !== 'SUPER_ADMIN' && variable.tenantId !== req.tenantId) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const updates = { ...req.body };
    delete updates._id;
    delete updates.id;
    variables[index] = { ...variable, ...updates, updatedAt: new Date().toISOString() };
    await adapter.saveCollection('variables', variables);
    await createLog('VARIABLE_UPDATE', { id: variables[index].id, name: variables[index].name, tenantId: variables[index].tenantId }, req.user.id);
    res.json(variables[index]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', authenticate, authorize(['ADMIN', 'MANAGER', 'SUPER_ADMIN']), requireTenant, async (req, res) => {
  try {
    const allVariables = await adapter.getCollection('variables');
    const variable = allVariables.find(v => v.id === req.params.id);

    if (!variable) return res.status(404).json({ error: 'Variável não encontrada' });

    if (req.user.role !== 'SUPER_ADMIN' && variable.tenantId !== req.tenantId) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    // Usar deleteOne diretamente para persistir no MongoDB
    if (!adapter.db) await adapter.init();
    const collection = adapter.db.collection('variables');
    await collection.deleteOne({ id: req.params.id });

    await createLog('VARIABLE_DELETE', { id: variable.id, name: variable.name, tenantId: variable.tenantId }, req.user.id);
    res.json({ message: 'Variável removida', deleted: variable });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
