import express from 'express';
import cors from 'cors';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Carregar variáveis de ambiente do arquivo .env local
dotenv.config({ path: './.env' });

import adapter from './db/DatabaseAdapter.js';

try {
  await adapter.init();
  console.log('✅ MongoDB inicializado');
} catch (error) {
  console.error('❌ Falha ao conectar ao MongoDB:', error.message);
  process.exit(1);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: { origin: '*' }
});

const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';

if (!process.env.JWT_SECRET) {
  console.warn('⚠️ JWT_SECRET não definido, usando fallback temporário');
}

app.use(cors({
  origin: '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: { error: "Limite de requisições excedido" }
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50, // Aumentado para debug
  message: { error: 'Muitas tentativas de login' }
});

app.use('/api', apiLimiter);

app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  next();
});

const loginSchema = z.object({
  username: z.string().min(3),
  password: z.string().min(3),
});

const userSchema = z.object({
  username: z.string().min(3),
  password: z.string().min(6),
  name: z.string().min(1),
  role: z.enum(['ADMIN', 'MANAGER', 'AGENT']),
  queues: z.array(z.string()).optional(),
  tenantId: z.string().optional(),
});

const variableSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['text', 'number', 'boolean', 'json']),
  defaultValue: z.any().optional(),
  description: z.string().optional(),
});

const flowSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  nodes: z.array(z.any()).optional(),
  edges: z.array(z.any()).optional(),
});

const templateSchema = z.object({
  name: z.string().min(1),
  text: z.string().min(1),
  buttons: z.array(z.object({
    id: z.string(),
    label: z.string(),
    nextNodeId: z.string().optional()
  })).optional(),
});

const scheduleSchema = z.object({
  name: z.string().min(1),
  days: z.array(z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'])),
  openTime: z.string(),
  closeTime: z.string(),
});

const createLog = async (type, message, userId = 'system') => {
  const logMessage = typeof message === 'object' ? JSON.stringify(message) : String(message || '');
  
  const newLog = {
    id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    timestamp: new Date().toISOString(),
    type,
    message: logMessage,
    userId
  };

  try {
    let systemLogs = await adapter.getCollection('systemLogs');
    if (!systemLogs) systemLogs = [];
    
    systemLogs.unshift(newLog);
    if (systemLogs.length > 500) systemLogs = systemLogs.slice(0, 500);
    
    await adapter.saveCollection('systemLogs', systemLogs);
    console.log(`[LOG] ${type}: ${logMessage}`);
    
    if (typeof io !== 'undefined') {
      io.emit('new_log', newLog);
    }
  } catch (error) {
    console.error('Erro ao criar log:', error);
  }
};

const authenticate = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
  
  if (!token) return res.status(401).json({ error: "Token ausente" });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const users = await adapter.getCollection('users');
    const user = users.find(u => u.id === decoded.userId);

    if (!user) {
      return res.status(401).json({ error: "Usuário inválido" });
    }

    req.user = user;
    req.tokenInfo = decoded;
    next();
  } catch (e) {
    res.status(401).json({ error: "Token inválido ou expirado" });
  }
};

const authorize = (roles) => (req, res, next) => {
  if (req.user.role === 'SUPER_ADMIN') return next();
  if (!roles.includes(req.user.role)) return res.status(403).json({ error: "Proibido" });
  next();
};

const requireTenant = async (req, res, next) => {
  const user = req.user;
  const queryTenantId = req.query.tenantId;

  if (queryTenantId) {
    req.tenantId = queryTenantId;
    return next();
  }

  if (user.role === 'SUPER_ADMIN') return next();
  if (!user.tenantId) return res.status(400).json({ error: 'Usuário não pertence a nenhum tenant' });

  req.tenantId = user.tenantId;
  next();
};

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// System Logs Endpoint
app.get('/api/logs', authenticate, async (req, res) => {
  try {
    const logs = await adapter.getCollection('systemLogs');
    res.json({ logs: logs || [], total: logs?.length || 0, page: 1, totalPages: 1 });
  } catch (error) {
    res.status(500).json({ logs: [], total: 0, page: 1, totalPages: 1 });
  }
});

// Super Admin Dashboard Endpoint
app.get('/api/super-admin/dashboard', authenticate, async (req, res) => {
  try {
    if (req.user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    // Buscar todos os dados
    const [tenants, users, flows, activeChats] = await Promise.all([
      adapter.getCollection('tenants'),
      adapter.getCollection('users'),
      adapter.getCollection('flows'),
      adapter.getCollection('activeChats')
    ]);

    // Calcular métricas
    const metrics = {
      tenants: {
        total: tenants.length,
        ativos: tenants.filter(t => t.status === 'active').length,
        trial: tenants.filter(t => t.status === 'trial').length,
        suspensos: tenants.filter(t => t.status === 'suspended').length
      },
      usuarios: {
        total: users.length,
        porTenant: users.reduce((acc, user) => {
          const existing = acc.find(a => a.tenantId === user.tenantId);
          if (existing) {
            existing.count++;
          } else {
            acc.push({ tenantId: user.tenantId || 'super_admin', count: 1 });
          }
          return acc;
        }, [])
      },
      flows: {
        total: flows.length,
        porTenant: flows.reduce((acc, flow) => {
          const existing = acc.find(a => a.tenantId === flow.tenantId);
          if (existing) {
            existing.count++;
          } else {
            acc.push({ tenantId: flow.tenantId || 'super_admin', count: 1 });
          }
          return acc;
        }, [])
      },
      chats: {
        total: activeChats.length,
        porTenant: activeChats.reduce((acc, chat) => {
          const existing = acc.find(a => a.tenantId === chat.tenantId);
          if (existing) {
            existing.count++;
          } else {
            acc.push({ tenantId: chat.tenantId || 'super_admin', count: 1 });
          }
          return acc;
        }, [])
      },
      billing: tenants.map(t => ({
        tenantId: t.id,
        name: t.name,
        plan: t.plan || 'free',
        status: t.status || 'active'
      }))
    };

    res.json(metrics);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/tenants', async (req, res) => {
  try {
    const tenants = await adapter.getCollection('tenants');
    res.json(tenants);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/auth/login', loginLimiter, async (req, res) => {
  try {
    const { username, password } = loginSchema.parse(req.body);
    
    const users = await adapter.getCollection('users');
    let user = users.find(u => u.username === username);

    if (!user) {
      return res.status(401).json({ error: "Usuário não encontrado" });
    }

    let isMatch = false;
    if (user.password && user.password.startsWith('$2b$')) {
      isMatch = await bcrypt.compare(password, user.password);
    } else {
      isMatch = user.password === password;
    }

    if (!isMatch) {
      return res.status(401).json({ error: "Senha incorreta" });
    }

    const token = jwt.sign({ userId: user.id, tenantId: user.tenantId, role: user.role }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

    const { password: _, ...userWithoutPassword } = user;
    res.json({ user: userWithoutPassword, token });
  } catch (error) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: error.errors[0].message });
    }
    res.status(500).json({ error: error.message });
  }
});

// Heartbeat Endpoint
app.get('/api/auth/heartbeat', authenticate, async (req, res) => {
  try {
    const tenantId = req.query.tenantId;
    const user = req.user;
    
    res.json({
      valid: true,
      user: {
        id: user.id,
        name: user.name,
        username: user.username,
        role: user.role,
        tenantId: tenantId || user.tenantId
      }
    });
  } catch (error) {
    res.status(500).json({ valid: false, error: error.message });
  }
});

// Get Users by Tenant Endpoint
app.get('/api/tenants/:tenantId/users', authenticate, async (req, res) => {
  try {
    const { tenantId } = req.params;
    const users = await adapter.getCollection('users', tenantId);
    const usersWithoutPasswords = users.map(({ password, ...user }) => user);
    res.json(usersWithoutPasswords);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/tenant/current', authenticate, async (req, res) => {
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
    res.json(tenant ? { ...tenant, role: req.user.role } : { id: 'unknown', name: 'Unknown' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/tenants', authenticate, async (req, res) => {
  try {
    const { name, plan } = req.body;
    const tenant = {
      id: `tenant_${Date.now()}`,
      name,
      plan: plan || 'free',
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const tenants = await adapter.getCollection('tenants');
    tenants.push(tenant);
    await adapter.saveCollection('tenants', tenants);

    res.status(201).json(tenant);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Switch Tenant Endpoint
app.post('/api/tenants/:tenantId/switch', authenticate, async (req, res) => {
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

app.get('/api/users', authenticate, requireTenant, async (req, res) => {
  try {
    const users = await adapter.getCollection('users', req.tenantId);
    const usersWithoutPasswords = users.map(({ password, ...user }) => user);
    res.json(usersWithoutPasswords);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/users', authenticate, authorize(['ADMIN', 'SUPER_ADMIN']), async (req, res) => {
  try {
    const { name, username, password, role, queues, tenantId: bodyTenantId } = userSchema.parse(req.body);
    
    const tenantId = req.user.role === 'SUPER_ADMIN' ? (bodyTenantId || req.user.tenantId) : req.user.tenantId;
    
if (!tenantId && req.user.role !== 'SUPER_ADMIN') {
      return res.status(400).json({ error: 'Administrador deve pertencer a nenhum tenant' });
    }

    // Buscar apenas usuários DO TENANT atual
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
      permissions: [],
      tenantId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: req.user.id
    };

    console.log('[USER CREATE] Salvando usuário:', user); // Debug

    users.push(user);
    await adapter.saveCollection('users', users);
    await createLog('USER_ACTION', `Usuário criado: ${username}`, req.user.id);

    const { password: _, ...userWithoutPassword } = user;
    res.status(201).json(userWithoutPassword);
  } catch (error) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: error.errors });
    }
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/users/:id', authenticate, authorize(['ADMIN', 'SUPER_ADMIN']), async (req, res) => {
  try {
    const users = await adapter.getCollection('users', req.tenantId);
    const index = users.findIndex(u => u.id === req.params.id);
    
    if (index === -1) return res.status(404).json({ error: 'Usuário não encontrado' });
    
    if (req.user.role !== 'SUPER_ADMIN' && users[index].tenantId !== req.tenantId) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const deleted = users.splice(index, 1)[0];
    await adapter.saveCollection('users', users);
    await createLog('USER_ACTION', `Usuário removido: ${deleted.username}`, req.user.id);

    const { password: _, ...userWithoutPassword } = deleted;
    res.json({ message: 'Usuário removido', deleted: userWithoutPassword });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/flows', authenticate, requireTenant, async (req, res) => {
  try {
    const flows = await adapter.getCollection('flows', req.tenantId);
    res.json(flows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get Flow by ID (busca por ID sem filtro de tenant)
app.get('/api/flows/:id', authenticate, async (req, res) => {
  try {
    const allFlows = await adapter.getCollection('flows');
    const flow = allFlows.find(f => f.id === req.params.id);
    
    if (!flow) {
      return res.status(404).json({ error: 'Fluxo não encontrado' });
    }
    
    res.json(flow);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/flows', authenticate, authorize(['ADMIN', 'MANAGER', 'SUPER_ADMIN']), requireTenant, async (req, res) => {
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
        nodes: [{ id: 'start', type: 'startNode', position: { x: 400, y: 300 }, data: { label: 'Início', text: 'Início' } }],
        edges: []
      },
      published: null
    };
    
    // Usar upsert direto em vez de buscar todos e sobrescrever
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

app.put('/api/flows/:id', authenticate, authorize(['ADMIN', 'MANAGER', 'SUPER_ADMIN']), requireTenant, async (req, res) => {
  try {
    const { nodes, edges, status, name, description } = req.body;
    const flows = await adapter.getCollection('flows', req.tenantId);
    const index = flows.findIndex(f => f.id === req.params.id);
    
    if (index === -1) return res.status(404).json({ error: 'Fluxo não encontrado' });

    if (req.user.role !== 'SUPER_ADMIN' && flows[index].tenantId !== req.tenantId) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    flows[index] = {
      ...flows[index],
      name: name || flows[index].name,
      description: description || flows[index].description,
      nodes,
      edges,
      status,
      updatedAt: new Date().toISOString(),
      version: (flows[index].version || 0) + 1
    };

    await adapter.saveCollection('flows', flows);
    await createLog('FLOW_ACTION', `Fluxo atualizado: ${flows[index].name}`, req.user.id);
    res.json(flows[index]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/flows/:id', authenticate, authorize(['ADMIN', 'MANAGER', 'SUPER_ADMIN']), requireTenant, async (req, res) => {
  try {
    const flows = await adapter.getCollection('flows', req.tenantId);
    const index = flows.findIndex(f => f.id === req.params.id);
    
    if (index === -1) return res.status(404).json({ error: 'Fluxo não encontrado' });
    
    if (req.user.role !== 'SUPER_ADMIN' && flows[index].tenantId !== req.tenantId) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const deleted = flows.splice(index, 1)[0];
    await adapter.saveCollection('flows', flows);
    await createLog('FLOW_ACTION', `Fluxo removido: ${deleted.name}`, req.user.id);
    res.json({ message: 'Fluxo removido', deleted });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/variables', authenticate, requireTenant, async (req, res) => {
  try {
    const variables = await adapter.getCollection('variables', req.tenantId);
    res.json(variables);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/variables', authenticate, authorize(['ADMIN', 'MANAGER', 'SUPER_ADMIN']), requireTenant, async (req, res) => {
  try {
    const data = variableSchema.parse(req.body);
    
    const variable = {
      id: `var_${Date.now()}`,
      ...data,
      tenantId: req.user.role === 'SUPER_ADMIN' ? req.body.tenantId : req.tenantId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    const variables = await adapter.getCollection('variables');
    variables.push(variable);
    await adapter.saveCollection('variables', variables);
    res.status(201).json(variable);
  } catch (error) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: error.errors });
    }
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/variables/:id', authenticate, authorize(['ADMIN', 'MANAGER', 'SUPER_ADMIN']), requireTenant, async (req, res) => {
  try {
    const variables = await adapter.getCollection('variables', req.tenantId);
    const index = variables.findIndex(v => v.id === req.params.id);
    
    if (index === -1) return res.status(404).json({ error: 'Variável não encontrada' });
    
    if (req.user.role !== 'SUPER_ADMIN' && variables[index].tenantId !== req.tenantId) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    variables[index] = { ...variables[index], ...req.body, updatedAt: new Date().toISOString() };
    await adapter.saveCollection('variables', variables);
    res.json(variables[index]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/variables/:id', authenticate, authorize(['ADMIN', 'MANAGER', 'SUPER_ADMIN']), requireTenant, async (req, res) => {
  try {
    const variables = await adapter.getCollection('variables', req.tenantId);
    const index = variables.findIndex(v => v.id === req.params.id);
    
    if (index === -1) return res.status(404).json({ error: 'Variável não encontrada' });
    
    if (req.user.role !== 'SUPER_ADMIN' && variables[index].tenantId !== req.tenantId) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const deleted = variables.splice(index, 1)[0];
    await adapter.saveCollection('variables', variables);
    res.json({ message: 'Variável removida', deleted });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/templates', authenticate, requireTenant, async (req, res) => {
  try {
    const templates = await adapter.getCollection('messageTemplates', req.tenantId);
    res.json(templates);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/templates', authenticate, authorize(['ADMIN', 'MANAGER', 'SUPER_ADMIN']), requireTenant, async (req, res) => {
  try {
    const data = templateSchema.parse(req.body);
    
    const template = {
      id: `tpl_${Date.now()}`,
      ...data,
      tenantId: req.user.role === 'SUPER_ADMIN' ? req.body.tenantId : req.tenantId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    const templates = await adapter.getCollection('messageTemplates');
    templates.push(template);
    await adapter.saveCollection('messageTemplates', templates);
    res.status(201).json(template);
  } catch (error) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: error.errors });
    }
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/templates/:id', authenticate, authorize(['ADMIN', 'MANAGER', 'SUPER_ADMIN']), requireTenant, async (req, res) => {
  try {
    const templates = await adapter.getCollection('messageTemplates', req.tenantId);
    const index = templates.findIndex(t => t.id === req.params.id);
    
    if (index === -1) return res.status(404).json({ error: 'Template não encontrado' });
    
    if (req.user.role !== 'SUPER_ADMIN' && templates[index].tenantId !== req.tenantId) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const deleted = templates.splice(index, 1)[0];
    await adapter.saveCollection('messageTemplates', templates);
    res.json({ message: 'Template removido', deleted });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/schedules', authenticate, requireTenant, async (req, res) => {
  try {
    const schedules = await adapter.getCollection('schedules', req.tenantId);
    res.json(schedules);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/schedules', authenticate, authorize(['ADMIN', 'MANAGER', 'SUPER_ADMIN']), requireTenant, async (req, res) => {
  try {
    const data = scheduleSchema.parse(req.body);
    
    const schedule = {
      id: `sch_${Date.now()}`,
      ...data,
      tenantId: req.user.role === 'SUPER_ADMIN' ? req.body.tenantId : req.tenantId,
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

app.get('/api/cannedResponses', authenticate, authorize(['ADMIN', 'MANAGER', 'SUPER_ADMIN']), requireTenant, async (req, res) => {
  try {
    const responses = await adapter.getCollection('cannedResponses', req.tenantId);
    res.json(responses);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/cannedResponses', authenticate, authorize(['ADMIN', 'MANAGER', 'SUPER_ADMIN']), requireTenant, async (req, res) => {
  try {
    const { name, message, shortcut } = req.body;
    
    const response = {
      id: `cr_${Date.now()}`,
      name,
      message,
      shortcut,
      tenantId: req.user.role === 'SUPER_ADMIN' ? req.body.tenantId : req.tenantId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    const responses = await adapter.getCollection('cannedResponses');
    responses.push(response);
    await adapter.saveCollection('cannedResponses', responses);
    res.status(201).json(response);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/cannedResponses/:id', authenticate, authorize(['ADMIN', 'MANAGER', 'SUPER_ADMIN']), requireTenant, async (req, res) => {
  try {
    const { name, message, shortcut } = req.body;
    const responses = await adapter.getCollection('cannedResponses');
    const index = responses.findIndex(r => r.id === req.params.id);
    
    if (index === -1) return res.status(404).json({ error: 'Canned Response não encontrado' });
    
    if (req.user.role !== 'SUPER_ADMIN' && responses[index].tenantId !== req.tenantId) {
      return res.status(403).json({ error: 'Acesso negado' });
    }
    
    responses[index] = { ...responses[index], name, message, shortcut, updatedAt: new Date().toISOString() };
    await adapter.saveCollection('cannedResponses', responses);
    res.json(responses[index]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/cannedResponses/:id', authenticate, authorize(['ADMIN', 'MANAGER', 'SUPER_ADMIN']), requireTenant, async (req, res) => {
  try {
    const responses = await adapter.getCollection('cannedResponses');
    const index = responses.findIndex(r => r.id === req.params.id);
    
    if (index === -1) return res.status(404).json({ error: 'Canned Response não encontrado' });
    
    if (req.user.role !== 'SUPER_ADMIN' && responses[index].tenantId !== req.tenantId) {
      return res.status(403).json({ error: 'Acesso negado' });
    }
    
    const deleted = responses.splice(index, 1)[0];
    await adapter.saveCollection('cannedResponses', responses);
    res.json({ message: 'Canned Response removido', deleted });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/tags', authenticate, authorize(['ADMIN', 'MANAGER', 'SUPER_ADMIN']), requireTenant, async (req, res) => {
  try {
    const tags = await adapter.getCollection('tags', req.tenantId);
    res.json(tags);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/tags', authenticate, authorize(['ADMIN', 'MANAGER', 'SUPER_ADMIN']), requireTenant, async (req, res) => {
  try {
    const { name, color } = req.body;
    
    const tag = {
      id: `tag_${Date.now()}`,
      name,
      color: color || '#3B82F6',
      tenantId: req.user.role === 'SUPER_ADMIN' ? req.body.tenantId : req.tenantId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    const tags = await adapter.getCollection('tags');
    tags.push(tag);
    await adapter.saveCollection('tags', tags);
    res.status(201).json(tag);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/tags/:id', authenticate, authorize(['ADMIN', 'MANAGER', 'SUPER_ADMIN']), requireTenant, async (req, res) => {
  try {
    const { name, color } = req.body;
    const tags = await adapter.getCollection('tags');
    const index = tags.findIndex(t => t.id === req.params.id);
    
    if (index === -1) return res.status(404).json({ error: 'Tag não encontrada' });
    
    if (req.user.role !== 'SUPER_ADMIN' && tags[index].tenantId !== req.tenantId) {
      return res.status(403).json({ error: 'Acesso negado' });
    }
    
    tags[index] = { ...tags[index], name, color, updatedAt: new Date().toISOString() };
    await adapter.saveCollection('tags', tags);
    res.json(tags[index]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/tags/:id', authenticate, authorize(['ADMIN', 'MANAGER', 'SUPER_ADMIN']), requireTenant, async (req, res) => {
  try {
    const tags = await adapter.getCollection('tags');
    const index = tags.findIndex(t => t.id === req.params.id);
    
    if (index === -1) return res.status(404).json({ error: 'Tag não encontrada' });
    
    if (req.user.role !== 'SUPER_ADMIN' && tags[index].tenantId !== req.tenantId) {
      return res.status(403).json({ error: 'Acesso negado' });
    }
    
    const deleted = tags.splice(index, 1)[0];
    await adapter.saveCollection('tags', tags);
    res.json({ message: 'Tag removida', deleted });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/webhooks', authenticate, authorize(['ADMIN', 'SUPER_ADMIN']), requireTenant, async (req, res) => {
  try {
    const webhooks = await adapter.getCollection('webhooks', req.tenantId);
    res.json(webhooks);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/webhooks', authenticate, authorize(['ADMIN', 'SUPER_ADMIN']), requireTenant, async (req, res) => {
  try {
    const { name, url, events, secret } = req.body;
    
    const webhook = {
      id: `wh_${Date.now()}`,
      name,
      url,
      events: events || [],
      secret: secret || null,
      tenantId: req.user.role === 'SUPER_ADMIN' ? req.body.tenantId : req.tenantId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    const webhooks = await adapter.getCollection('webhooks');
    webhooks.push(webhook);
    await adapter.saveCollection('webhooks', webhooks);
    res.status(201).json(webhook);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/webhooks/:id', authenticate, authorize(['ADMIN', 'SUPER_ADMIN']), requireTenant, async (req, res) => {
  try {
    const { name, url, events, secret } = req.body;
    const webhooks = await adapter.getCollection('webhooks');
    const index = webhooks.findIndex(w => w.id === req.params.id);
    
    if (index === -1) return res.status(404).json({ error: 'Webhook não encontrado' });
    
    if (req.user.role !== 'SUPER_ADMIN' && webhooks[index].tenantId !== req.tenantId) {
      return res.status(403).json({ error: 'Acesso negado' });
    }
    
    webhooks[index] = { ...webhooks[index], name, url, events, secret, updatedAt: new Date().toISOString() };
    await adapter.saveCollection('webhooks', webhooks);
    res.json(webhooks[index]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/webhooks/:id', authenticate, authorize(['ADMIN', 'SUPER_ADMIN']), requireTenant, async (req, res) => {
  try {
    const webhooks = await adapter.getCollection('webhooks');
    const index = webhooks.findIndex(w => w.id === req.params.id);
    
    if (index === -1) return res.status(404).json({ error: 'Webhook não encontrado' });
    
    if (req.user.role !== 'SUPER_ADMIN' && webhooks[index].tenantId !== req.tenantId) {
      return res.status(403).json({ error: 'Acesso negado' });
    }
    
    const deleted = webhooks.splice(index, 1)[0];
    await adapter.saveCollection('webhooks', webhooks);
    res.json({ message: 'Webhook removido', deleted });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/chats', authenticate, requireTenant, async (req, res) => {
  try {
    const chats = await adapter.getCollection('activeChats', req.tenantId);
    res.json(chats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/chats/:id', authenticate, requireTenant, async (req, res) => {
  try {
    const chats = await adapter.getCollection('activeChats');
    const chat = chats.find(c => c.id === req.params.id);
    
    if (!chat) return res.status(404).json({ error: 'Chat não encontrado' });
    
    if (req.user.role !== 'SUPER_ADMIN' && chat.tenantId !== req.tenantId) {
      return res.status(403).json({ error: 'Acesso negado' });
    }
    
    res.json(chat);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/queues', authenticate, async (req, res) => {
  try {
    const queues = await adapter.getCollection('queues');
    res.json(queues || []);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/queues', authenticate, authorize(['ADMIN']), async (req, res) => {
  try {
    const { name, color } = req.body;
    if (!name) return res.status(400).json({ error: 'Nome é obrigatório' });
    
    const newQueue = { 
      id: `q_${Date.now()}`,
      name: name.toUpperCase(), 
      color: color || '#3b82f6',
      tenantId: req.user.tenantId,
      createdAt: new Date().toISOString()
    };
    
    const queues = await adapter.getCollection('queues');
    queues.push(newQueue);
    await adapter.saveCollection('queues', queues);
    res.json(newQueue);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/queues/:id', authenticate, authorize(['ADMIN']), async (req, res) => {
  try {
    const queues = await adapter.getCollection('queues');
    const filtered = queues.filter(q => q.id !== req.params.id);
    await adapter.saveCollection('queues', filtered);
    res.json({ message: 'Fila removida' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.use(express.static(path.join(__dirname, '../client/dist')));

httpServer.listen(PORT, () => {
  console.log(`✅ Servidor rodando na porta ${PORT}`);
});

export default app;
