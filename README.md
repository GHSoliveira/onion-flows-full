# 🤖 ChatBot Multi-Tenant

Sistema de chatbot multi-tenant com interface administrativa completa, construído em Node.js, React e MongoDB.

## ✨ Funcionalidades

- 🔐 **Sistema de Auth** com JWT e bcrypt
- 🏢 **Multi-Tenant** - múltiplas empresas isoladas
- 👥 **Gestão de Usuários** com roles (Admin, Manager, Agent)
- 🔄 **Fluxos de Conversa** - editor visual com nodes
- 📊 **Dashboard Admin** - métricas e billing
- 💬 **Simulador de Chat** - teste fluxos em tempo real
- 📝 **Logs de Auditoria** - registro de ações
- 🌙 **Dark Mode** - interface adaptativa

## 🏗️ Arquitetura

```
ChatBot/
├── client/                 # Frontend React + Vite
│   ├── src/
│   │   ├── components/    # Componentes reutilizáveis
│   │   ├── context/       # React Context (Auth, Tenant)
│   │   ├── nodes/         # Custom React Flow nodes
│   │   ├── pages/         # Páginas da aplicação
│   │   └── services/      # API, Socket services
│   └── dist/              # Build de produção
└── server/                # Backend Node.js + Express
    ├── db/                # Database Adapter (MongoDB)
    └── index.js           # Servidor principal
```

## 🚀 Quick Start

### Pré-requisitos
- Node.js 18+
- MongoDB (local ou Atlas)

### Instalação

```bash
# Clonar o repositório
git clone https://github.com/seu-usuario/chatbot.git
cd chatbot

# Instalar dependências do servidor
cd server
npm install

# Instalar dependências do cliente
cd ../client
npm install

# Configurar variáveis de ambiente
cd ../server
cp .env.example .env
# Editar .env com suas configurações

# Iniciar desenvolvimento
cd ..
npm run dev
```

### Variáveis de Ambiente (.env)

```env
# Servidor
PORT=3001
NODE_ENV=production
CLIENT_URL=http://localhost:5173

# JWT
JWT_SECRET=sua_chave_secreta_super_segura
JWT_EXPIRES_IN=8h

# MongoDB Atlas (padrão)
MONGODB_URI=mongodb+srv://...
MONGODB_DB_NAME=fluxadmin

# Rate Limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=1000
LOGIN_RATE_LIMIT_MAX=5
```

### Scripts npm

```bash
npm run dev          # Iniciar servidor + cliente
npm run server       # Apenas servidor (nodemon)
npm run client       # Apenas cliente (Vite)
npm run build        # Build de produção (client)
npm run start        # Iniciar produção
```

## 👤 Usuário Admin Padrão

| Campo   | Valor    |
|---------|----------|
| Login   | `admin`  |
| Senha   | `123`    |
| Role    | SUPER_ADMIN |

⚠️ **Altere a senha após o primeiro login!**

## 📡 API Endpoints

### Auth
- `POST /api/auth/login` - Login
- `GET /api/auth/heartbeat` - Verificar sessão

### Tenants
- `GET /api/tenants` - Listar tenants
- `POST /api/tenants/:id/switch` - Trocar tenant
- `GET /api/super-admin/dashboard` - Dashboard geral

### Usuários
- `GET /api/users` - Listar usuários
- `POST /api/users` - Criar usuário
- `DELETE /api/users/:id` - Remover usuário

### Fluxos
- `GET /api/flows` - Listar fluxos
- `POST /api/flows` - Criar fluxo
- `GET /api/flows/:id` - Buscar fluxo por ID
- `PUT /api/flows/:id` - Atualizar fluxo
- `DELETE /api/flows/:id` - Remover fluxo

### Filas
- `GET /api/queues` - Listar filas
- `POST /api/queues` - Criar fila
- `DELETE /api/queues/:id` - Remover fila

### Sistema
- `GET /api/logs` - Logs de auditoria
- `GET /health` - Health check

## 🔑 Roles e Permissões

| Role       | Permissões                              |
|------------|-----------------------------------------|
| SUPER_ADMIN| Acesso total, todos tenants            |
| ADMIN      | Gestão de equipe e fluxos do tenant    |
| MANAGER    | Criar/editar fluxos                    |
| AGENT      | Acesso ao chat apenas                  |

## 🎨 Tecnologias

**Frontend:**
- React 19
- Vite
- TailwindCSS
- React Router
- React Flow (editor de fluxos)
- Socket.IO Client
- Lucide Icons

**Backend:**
- Node.js
- Express 5
- MongoDB + Mongoose
- JWT + bcrypt
- Socket.IO
- Zod (validação)

## 📄 Licença

MIT License - sinta-se livre para usar e modificar!

---

Feito com ⚡ por [Seu Nome]
