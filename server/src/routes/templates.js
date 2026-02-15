import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { authorize } from '../middleware/authorization.js';
import { requireTenant } from '../middleware/tenant.js';
import adapter from '../../db/DatabaseAdapter.js';
import { templateSchema } from '../schemas/index.js';
import { createLog } from '../services/logs.js';

const router = express.Router();

router.get('/', authenticate, requireTenant, async (req, res) => {
  try {
    const templates = await adapter.getCollection('messageTemplates', req.tenantId);
    res.json(templates);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', authenticate, authorize(['ADMIN', 'MANAGER', 'SUPER_ADMIN']), requireTenant, async (req, res) => {
  try {
    const data = templateSchema.parse(req.body);

    const template = {
      id: `tpl_${Date.now()}`,
      ...data,
      tenantId: req.user.role === 'SUPER_ADMIN' ? req.body.tenantId : req.tenantId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    if (!adapter.db) await adapter.init();
    const collection = adapter.db.collection('messageTemplates');
    await collection.insertOne(template);

    await createLog('TEMPLATE_CREATE', { id: template.id, name: template.name, tenantId: template.tenantId }, req.user.id);
    res.status(201).json(template);
  } catch (error) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: error.errors });
    }
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', authenticate, authorize(['ADMIN', 'MANAGER', 'SUPER_ADMIN']), requireTenant, async (req, res) => {
  try {
    if (!adapter.db) await adapter.init();
    const collection = adapter.db.collection('messageTemplates');

    const query = { id: req.params.id };
    if (req.user.role !== 'SUPER_ADMIN') {
      query.tenantId = req.tenantId;
    } else if (req.tenantId) {
      query.tenantId = req.tenantId;
    }

    const template = await collection.findOne(query);
    if (!template) return res.status(404).json({ error: 'Template nao encontrado' });

    await collection.deleteOne(query);

    await createLog('TEMPLATE_DELETE', { id: template.id, name: template.name, tenantId: template.tenantId }, req.user.id);
    res.json({ message: 'Template removido', deleted: template });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
