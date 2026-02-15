import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { loginSchema } from '../schemas/index.js';
import { authenticate } from '../middleware/auth.js';
import adapter from '../../db/DatabaseAdapter.js';
import { JWT_SECRET_VALUE, JWT_EXPIRES_IN } from '../config/constants.js';
import { markOnline } from '../services/userStatus.js';

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: { error: 'Muitas tentativas de login' }
});

// POST /api/auth/login
router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { username, password } = loginSchema.parse(req.body);

    const users = await adapter.getCollection('users');
    let user = users.find(u => u.username === username);

    if (!user) {
      return res.status(401).json({ error: 'Usuário não encontrado' });
    }

    let isMatch = false;
    if (user.password && user.password.startsWith('$2b$')) {
      isMatch = await bcrypt.compare(password, user.password);
    } else {
      isMatch = user.password === password;
    }

    if (!isMatch) {
      return res.status(401).json({ error: 'Senha incorreta' });
    }

    user.status = 'online';
    user.lastSeen = new Date().toISOString();
    await adapter.saveCollection('users', users);

    user.status = 'online';
    user.lastSeen = new Date().toISOString();
    await adapter.saveCollection('users', users);
    markOnline(user.id);

    const token = jwt.sign(
      { userId: user.id, tenantId: user.tenantId, role: user.role },
      JWT_SECRET_VALUE,
      { expiresIn: JWT_EXPIRES_IN }
    );

    const { password: _, ...userWithoutPassword } = user;
    res.json({ user: userWithoutPassword, token });
  } catch (error) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: error.errors[0].message });
    }
    res.status(500).json({ error: error.message });
  }
});

router.get('/heartbeat', authenticate, async (req, res) => {
  try {
    const tenantId = req.query.tenantId;
    const user = req.user;
    const users = await adapter.getCollection('users');
    const stored = users.find(u => u.id === user.id);
    if (stored) {
      stored.status = 'online';
      stored.lastSeen = new Date().toISOString();
      await adapter.saveCollection('users', users);
    }

    res.json({
      valid: true,
      user: {
        id: user.id,
        name: user.name,
        username: user.username,
        role: user.role,
        tenantId: tenantId || user.tenantId,
        ratingAvg: stored?.ratingAvg || 0,
        ratingCount: stored?.ratingCount || 0,
        ratingSum: stored?.ratingSum || 0
      }
    });
  } catch (error) {
    res.status(500).json({ valid: false, error: error.message });
  }
});

export default router;
