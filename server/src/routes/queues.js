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
    if (!name) return res.status(400).json({ error: 'Nome é obrigatório' });

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

    const queues = await adapter.getCollection('queues');
    queues.push(newQueue);
    await adapter.saveCollection('queues', queues);
    await createLog('QUEUE_CREATE', { id: newQueue.id, name: newQueue.name, tenantId: newQueue.tenantId }, req.user.id);
    res.json(newQueue);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', authenticate, authorize(['ADMIN']), requireTenant, async (req, res) => {
  try {
    const allQueues = await adapter.getCollection('queues');
    const queue = allQueues.find(q => q.id === req.params.id);

    if (!queue) return res.status(404).json({ error: 'Fila não encontrada' });
    if (req.user.role !== 'SUPER_ADMIN' && queue.tenantId !== req.tenantId) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    // Usar deleteOne diretamente para persistir no MongoDB
    if (!adapter.db) await adapter.init();
    const collection = adapter.db.collection('queues');
    await collection.deleteOne({ id: req.params.id });

    await createLog('QUEUE_DELETE', { id: queue.id, name: queue.name, tenantId: queue.tenantId }, req.user.id);
    res.json({ message: 'Fila removida' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
