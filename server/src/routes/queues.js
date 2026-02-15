import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { authorize } from '../middleware/authorization.js';
import { requireTenant } from '../middleware/tenant.js';
import adapter from '../../db/DatabaseAdapter.js';
import { createLog } from '../services/logs.js';

const router = express.Router();

router.get('/', authenticate, requireTenant, async (req, res) => {
  try {
    const queues = await adapter.getCollection('queues', req.tenantId);
    res.json(queues || []);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', authenticate, authorize(['ADMIN']), requireTenant, async (req, res) => {
  try {
    const { name, color } = req.body;
    if (!name) return res.status(400).json({ error: 'Nome e obrigatorio' });

    const tenantId = req.user.role === 'SUPER_ADMIN'
      ? (req.query.tenantId || req.body.tenantId || req.tenantId)
      : req.tenantId;

    const newQueue = {
      id: `q_${Date.now()}`,
      name: name.toUpperCase(),
      color: color || '#3b82f6',
      tenantId,
      createdAt: new Date().toISOString()
    };

    if (!adapter.db) await adapter.init();
    const collection = adapter.db.collection('queues');
    await collection.insertOne(newQueue);

    await createLog('QUEUE_CREATE', { id: newQueue.id, name: newQueue.name, tenantId: newQueue.tenantId }, req.user.id);
    res.json(newQueue);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', authenticate, authorize(['ADMIN']), requireTenant, async (req, res) => {
  try {
    if (!adapter.db) await adapter.init();
    const collection = adapter.db.collection('queues');

    const query = { id: req.params.id };
    if (req.user.role !== 'SUPER_ADMIN') {
      query.tenantId = req.tenantId;
    } else if (req.tenantId) {
      query.tenantId = req.tenantId;
    }

    const queue = await collection.findOne(query);
    if (!queue) return res.status(404).json({ error: 'Fila nao encontrada' });

    await collection.deleteOne(query);

    await createLog('QUEUE_DELETE', { id: queue.id, name: queue.name, tenantId: queue.tenantId }, req.user.id);
    res.json({ message: 'Fila removida' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
