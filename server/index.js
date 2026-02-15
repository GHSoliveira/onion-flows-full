import './src/config/env.js';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import adapter from './db/DatabaseAdapter.js';
import { setIo } from './src/services/logs.js';
import { markOffline } from './src/services/userStatus.js';
import { authenticate } from './src/middleware/auth.js';
import { authRouter } from './src/routes/index.js';
import { tenantsRouter } from './src/routes/index.js';
import { usersRouter } from './src/routes/index.js';
import { flowsRouter } from './src/routes/index.js';
import { variablesRouter } from './src/routes/index.js';
import { templatesRouter } from './src/routes/index.js';
import { schedulesRouter } from './src/routes/index.js';
import { queuesRouter } from './src/routes/index.js';
import { tagsRouter } from './src/routes/index.js';
import { webhooksRouter } from './src/routes/index.js';
import { chatsRouter } from './src/routes/index.js';
import { cannedResponsesRouter } from './src/routes/index.js';
import { logsRouter } from './src/routes/index.js';
import { superAdminRouter } from './src/routes/index.js';
import { tenantCurrentHandler } from './src/routes/index.js';
import { telegramRouter } from './src/routes/index.js';
import { channelsRouter } from './src/routes/index.js';
import { whatsappRouter } from './src/routes/index.js';
import { metricsRouter } from './src/routes/index.js';
import { startTelegramPolling } from './src/services/telegramPolling.js';
import { startDbChangeLogger } from './src/services/dbChangeLogger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3001;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';
const NODE_ENV = process.env.NODE_ENV || 'development';

try {
  await adapter.init();
  console.log('✅ MongoDB inicializado');
  await startDbChangeLogger();
} catch (error) {
  console.error('❌ Falha ao conectar ao MongoDB:', error.message);
  process.exit(1);
}

const app = express();
// behind reverse proxies (cloudflared, etc.)
app.set('trust proxy', 1);
const httpServer = createServer(app);
app.use(compression());

// Helmet - Headers de segurança HTTP
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "http://localhost:3001", "ws://localhost:3001"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// CORS - permitir origens explicitas de desenvolvimento e producao
const developmentOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:3000'
];

const productionOrigins = [
  'https://onionwebflows.vercel.app',
  CLIENT_URL
].filter(Boolean);

const allowedOrigins = [...new Set([...developmentOrigins, ...productionOrigins])];

const isAllowedOrigin = (origin) => {
  if (!origin) return true;
  return allowedOrigins.includes(origin);
};

app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (isAllowedOrigin(origin)) {
      return callback(null, true);
    }
    
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Socket.IO com CORS
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: function(origin, callback) {
      if (isAllowedOrigin(origin)) {
        return callback(null, true);
      }
      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST']
  },
  pingTimeout: 60000,
  pingInterval: 25000
});

// Rate limiting para Socket.IO - controlar conexões por IP
const socketConnections = new Map();
const SOCKET_MAX_CONNECTIONS_PER_IP = 5;
const SOCKET_RATE_LIMIT_WINDOW = 60000;
const socketMessageLimits = new Map();

io.use((socket, next) => {
  const clientIp = socket.handshake.address || socket.handshake.headers['x-forwarded-for'] || 'unknown';
  const now = Date.now();
  
  // Limitar conexões por IP
  const currentConnections = socketConnections.get(clientIp) || 0;
  if (currentConnections >= SOCKET_MAX_CONNECTIONS_PER_IP) {
    return next(new Error('Too many connections from this IP'));
  }
  
  // Registrar conexão
  socketConnections.set(clientIp, currentConnections + 1);
  
  socket.on('disconnect', () => {
    const count = socketConnections.get(clientIp) || 1;
    if (count <= 1) {
      socketConnections.delete(clientIp);
    } else {
      socketConnections.set(clientIp, count - 1);
    }
  });
  
  next();
});

io.on('connection', (socket) => {
  const clientIp = socket.handshake.address || 'unknown';
  
  // Rate limiting por socket
  socket.use((event, next) => {
    const now = Date.now();
    const key = `${clientIp}:${socket.id}`;
    const userMessages = socketMessageLimits.get(key) || { count: 0, resetTime: now + SOCKET_RATE_LIMIT_WINDOW };
    
    if (now > userMessages.resetTime) {
      userMessages.count = 0;
      userMessages.resetTime = now + SOCKET_RATE_LIMIT_WINDOW;
    }
    
    if (userMessages.count >= 100) {
      return next(new Error('Rate limit exceeded'));
    }
    
    userMessages.count++;
    socketMessageLimits.set(key, userMessages);
    next();
  });
  
  socket.on('error', (err) => {
    if (err.message !== 'Rate limit exceeded') {
      console.error('Socket error:', err.message);
    }
  });

  socket.on('disconnect', () => {
    if (socket.userId) {
      markOffline(socket.userId);
      io.emit('user_status', { userId: socket.userId, status: 'offline' });
    }
    console.log('Cliente desconectado:', socket.id);
  });
});

setIo(io);

app.use(express.json({
  limit: '10mb',
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: NODE_ENV === 'development' ? 1000 : 200,
  skip: (req) => req.path === '/chats/my-queues' || req.path === '/auth/heartbeat',
  message: { error: "Limite de requisições excedido" }
});

app.use('/api', apiLimiter);

app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  next();
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/tenant/current', authenticate, tenantCurrentHandler);

app.use('/api/auth', authRouter);
app.use('/api/tenants', tenantsRouter);
app.use('/api/users', usersRouter);
app.use('/api/flows', flowsRouter);
app.use('/api/variables', variablesRouter);
app.use('/api/templates', templatesRouter);
app.use('/api/schedules', schedulesRouter);
app.use('/api/queues', queuesRouter);
app.use('/api/tags', tagsRouter);
app.use('/api/webhooks', webhooksRouter);
app.use('/api/chats', chatsRouter);
app.use('/api/cannedResponses', cannedResponsesRouter);
app.use('/api/logs', logsRouter);
app.use('/api/super-admin', superAdminRouter);
app.use('/api/telegram', telegramRouter);
app.use('/api/channels', channelsRouter);
app.use('/api/whatsapp', whatsappRouter);
app.use('/api/metrics', metricsRouter);

app.use(express.static(path.join(__dirname, '../client/dist')));

httpServer.listen(PORT, () => {
  console.log(`✅ Servidor rodando na porta ${PORT}`);
  if (process.env.TELEGRAM_USE_POLLING === 'true') {
    console.log('✅ Telegram polling ativo');
    startTelegramPolling();
  }
});

export default app;

