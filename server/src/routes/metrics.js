import express from 'express';
import jwt from 'jsonwebtoken';
import adapter from '../../db/DatabaseAdapter.js';
import { JWT_SECRET_VALUE } from '../config/constants.js';

const router = express.Router();
const MAX_METRICS = 1000;

const optionalAuth = async (req) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : authHeader;

  if (!token) return null;
  try {
    const decoded = jwt.verify(token, JWT_SECRET_VALUE);
    const users = await adapter.getCollection('users');
    return users.find(u => u.id === decoded.userId) || null;
  } catch (e) {
    return null;
  }
};

router.post('/web-vitals', async (req, res) => {
  try {
    const metric = req.body || {};
    if (!metric || !metric.name) {
      return res.status(400).json({ error: 'Invalid metric' });
    }

    const user = await optionalAuth(req);
    const payload = {
      id: `wv_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
      name: metric.name,
      value: metric.value,
      rating: metric.rating,
      delta: metric.delta,
      navigationType: metric.navigationType || null,
      page: metric.page || null,
      userId: user?.id || null,
      tenantId: user?.tenantId || null
    };

    let metrics = await adapter.getCollection('webVitals');
    if (!metrics) metrics = [];
    metrics.unshift(payload);
    if (metrics.length > MAX_METRICS) {
      metrics = metrics.slice(0, MAX_METRICS);
    }
    await adapter.saveCollection('webVitals', metrics);

    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
