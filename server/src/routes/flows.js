import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { authorize } from '../middleware/authorization.js';
import { requireTenant } from '../middleware/tenant.js';
import adapter from '../../db/DatabaseAdapter.js';
import { flowSchema } from '../schemas/index.js';
import { createLog } from '../services/logs.js';
import { ensureTenantLimit } from '../services/tenantLimits.js';

const router = express.Router();

router.get('/', authenticate, requireTenant, async (req, res) => {
  try {
    const flows = await adapter.getCollection('flows', req.tenantId);
    const page = Math.max(parseInt(req.query.page || '1', 10) || 1, 1);
    const limitRaw = parseInt(req.query.limit || '0', 10) || 0;
    const limit = limitRaw > 0 ? Math.min(Math.max(limitRaw, 1), 500) : 0;

    if (!limit) {
      return res.json(flows);
    }

    const total = flows?.length || 0;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const start = (page - 1) * limit;
    const items = (flows || []).slice(start, start + limit);
    res.json({ items, total, page, totalPages, limit });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id', authenticate, async (req, res) => {
  try {
    const requestedTenantId = req.query.tenantId || null;
    const effectiveTenantId =
      req.user.role === 'SUPER_ADMIN'
        ? (requestedTenantId || req.user.tenantId || null)
        : req.user.tenantId;

    const allFlows = await adapter.getCollection('flows');
    const flow = allFlows.find((entry) => {
      if (entry.id !== req.params.id) return false;
      if (req.user.role === 'SUPER_ADMIN' && !effectiveTenantId) return true;
      return String(entry.tenantId || '') === String(effectiveTenantId || '');
    });

    if (!flow) {
      return res.status(404).json({ error: 'Fluxo nao encontrado' });
    }

    res.json(flow);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', authenticate, authorize(['ADMIN', 'MANAGER', 'SUPER_ADMIN']), requireTenant, async (req, res) => {
  try {
    const data = flowSchema.parse(req.body);

    const flow = {
      id: `f_${Date.now()}`,
      name: data.name,
      description: data.description || '',
      status: 'draft',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: req.user?.id || 'system',
      version: 1,
      tenantId: req.user.role === 'SUPER_ADMIN' ? (req.body.tenantId || req.tenantId) : req.tenantId,
      draft: {
        nodes: [{ id: 'start', type: 'startNode', position: { x: 400, y: 300 }, data: { label: 'Inicio', text: 'Inicio' } }],
        edges: []
      },
      published: null
    };

    await ensureTenantLimit(flow.tenantId, 'flows');

    const collection = adapter.db.collection('flows');
    await collection.updateOne(
      { id: flow.id },
      { $set: flow },
      { upsert: true }
    );

    await createLog('FLOW_ACTION', `Fluxo criado: ${flow.name}`, req.user.id, req.tenantId);
    res.status(201).json(flow);
  } catch (error) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: error.errors });
    }
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id', authenticate, authorize(['ADMIN', 'MANAGER', 'SUPER_ADMIN']), requireTenant, async (req, res) => {
  try {
    const { nodes, edges, status, name, description, published } = req.body;
    const allFlows = await adapter.getCollection('flows');
    const flow = allFlows.find((entry) => entry.id === req.params.id);

    if (!flow) return res.status(404).json({ error: 'Fluxo nao encontrado' });

    if (req.user.role !== 'SUPER_ADMIN' && flow.tenantId !== req.tenantId) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const draftSnapshot = {
      nodes: [...nodes],
      edges: [...edges]
    };

    const updatedFlow = {
      ...flow,
      name: name || flow.name,
      description: description || flow.description,
      nodes,
      edges,
      draft: draftSnapshot,
      status,
      updatedAt: new Date().toISOString(),
      version: (flow.version || 0) + 1
    };

    if (published) {
      updatedFlow.published = {
        nodes: [...nodes],
        edges: [...edges],
        publishedAt: new Date().toISOString(),
        version: updatedFlow.version
      };
      updatedFlow.status = 'published';
    }

    if (!adapter.db) await adapter.init();
    const collection = adapter.db.collection('flows');
    await collection.updateOne(
      { id: req.params.id },
      { $set: updatedFlow }
    );

    await createLog('FLOW_ACTION', `Fluxo atualizado: ${updatedFlow.name}`, req.user.id, req.tenantId);
    res.json(updatedFlow);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', authenticate, authorize(['ADMIN', 'MANAGER', 'SUPER_ADMIN']), requireTenant, async (req, res) => {
  try {
    if (!adapter.db) await adapter.init();
    const collection = adapter.db.collection('flows');

    const query = { id: req.params.id };

    if (req.user.role !== 'SUPER_ADMIN') {
      query.tenantId = req.tenantId;
    } else if (req.tenantId) {
      query.tenantId = req.tenantId;
    }

    const flow = await collection.findOne(query, { projection: { id: 1, name: 1, tenantId: 1 } });
    const result = await collection.deleteOne(query);

    if (!result.deletedCount) {
      return res.json({ message: 'Fluxo ja removido', deleted: null });
    }

    await createLog('FLOW_ACTION', `Fluxo removido: ${flow?.name || req.params.id}`, req.user.id);
    res.json({ message: 'Fluxo removido', deleted: flow || { id: req.params.id } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
