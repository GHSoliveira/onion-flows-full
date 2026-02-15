import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { authorize } from '../middleware/authorization.js';
import { requireTenant } from '../middleware/tenant.js';
import adapter from '../../db/DatabaseAdapter.js';
import { scheduleSchema } from '../schemas/index.js';

const router = express.Router();

router.get('/', authenticate, requireTenant, async (req, res) => {
  try {
    const schedules = await adapter.getCollection('schedules', req.tenantId);
    res.json(schedules);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', authenticate, authorize(['ADMIN', 'MANAGER', 'SUPER_ADMIN']), requireTenant, async (req, res) => {
  try {
    const data = scheduleSchema.parse(req.body);

    const schedule = {
      id: `sch_${Date.now()}`,
      ...data,
      tenantId: req.user.role === 'SUPER_ADMIN'
        ? req.body.tenantId || req.tenantId
        : req.tenantId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const schedules = await adapter.getCollection('schedules');
    schedules.push(schedule);
    await adapter.saveCollection('schedules', schedules);
    res.status(201).json(schedule);
  } catch (error) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: error.errors });
    }
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', authenticate, authorize(['ADMIN', 'MANAGER', 'SUPER_ADMIN']), requireTenant, async (req, res) => {
  try {
    const { id } = req.params;

    if (!adapter.db) await adapter.init();
    const collection = adapter.db.collection('schedules');
    const schedule = await collection.findOne({ id });

    if (!schedule) {
      return res.status(404).json({ error: 'Horário não encontrado' });
    }

    if (req.user.role !== 'SUPER_ADMIN' && schedule.tenantId !== req.tenantId) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    await collection.deleteOne({ id });
    res.json({ message: 'Horário removido', deleted: schedule });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
