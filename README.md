# Onion Web Flows

SaaS de automacao conversacional multi-tenant com editor de fluxos, canais (WhatsApp/Telegram), gestao de equipe e observabilidade operacional.

## Demo em producao

- Frontend (Vercel): https://onionwebflows.vercel.app/
- Backend API (Render): https://onion-web-flows-backend.onrender.com/

## Acesso de teste (sem super admin)

Ambiente de demonstracao para recrutadores e testadores:

- URL: https://onionwebflows.vercel.app/
- Tenant: `Empresa-demo-1` (`tenant_1771126505079`)

Usuarios de demonstracao:

- Perfil `MANAGER`
  - usuario: `root-manager`
  - senha: `12345678`
- Perfil `AGENT`
  - usuario: `root-agent`
  - senha: `12345678`

Observacao: contas de demonstracao com permissoes limitadas, sem acesso `SUPER_ADMIN`.

## Problema e proposta

Times de atendimento costumam depender de processos manuais para distribuicao, roteamento e resposta. O Onion Web Flows centraliza isso em um unico painel com:

- editor visual de fluxo conversacional;
- controle de acesso por papel e tenant;
- operacao de canais e filas;
- metricas, logs e monitoramento.

## Stack tecnica

- Frontend: React 19, Vite, React Router, Zustand, React Flow, Socket.IO Client, Tailwind CSS.
- Backend: Node.js, Express 5, MongoDB, JWT, bcrypt, Zod, Socket.IO.
- Carga e testes de estresse: k6 (`k6/chat-load.js`, `k6/stress-suite.js`).
- Deploy: Vercel (client) + Render (server).

## Arquitetura resumida

```
.
|-- client/          # UI administrativa, editor de fluxo, dashboards e simulador
|-- server/          # API REST, autenticacao, regras multi-tenant, integracoes de canal
|-- k6/              # scripts de carga e estresse
|-- .env.example     # variaveis de ambiente de referencia
`-- README.md
```

Separacao intencional entre frontend e backend para facilitar deploy independente, escalabilidade por camada e manutencao por responsabilidade.

## Funcionalidades principais

- Autenticacao JWT com controle de sessao.
- Multi-tenant com isolamento logico por empresa.
- RBAC com papeis (`SUPER_ADMIN`, `ADMIN`, `MANAGER`, `AGENT`).
- Editor de fluxos com nodes customizados.
- Simulador de conversa para validacao de fluxo.
- Filas, tags, templates, variaveis e gerenciamento de usuarios.
- Logs e endpoints de monitoramento.

## Como rodar localmente

### Pre-requisitos

- Node.js 18+
- MongoDB local ou Atlas

### Backend

```bash
cd server
npm install
cp .env.example .env
npm run dev
```

### Frontend

```bash
cd client
npm install
npm run dev
```

Frontend padrao: `http://localhost:5173`  
Backend padrao: `http://localhost:3001`

## Variaveis de ambiente

- Base de referencia: `server/.env.example` e `.env.example` na raiz.
- Campos criticos: `MONGODB_URI`, `JWT_SECRET`, `CLIENT_URL`, `PORT`.
- Nunca commitar `.env` com segredo real.

## Endpoints uteis

- Health check: `GET /health`
- Login: `POST /api/auth/login`
- Sessao: `GET /api/auth/heartbeat`
- Fluxos: `GET /api/flows`, `POST /api/flows`, `PUT /api/flows/:id`
- Usuarios: `GET /api/users`, `POST /api/users`

Documentacao adicional de API: `server/API_DOCUMENTATION.md`.

## Qualidade e engenharia

- ESLint no frontend (`client/eslint.config.js`).
- Scripts de carga com k6 para cenarios de estresse.
- Validacao de payload no backend com Zod.
- Rate limit e middlewares de seguranca (helmet/cors).

## Roadmap tecnico curto

- Cobertura de testes automatizados (API e fluxos criticos do frontend).
- Pipeline CI unificado para lint + build + testes.
- ADRs tecnicos em `docs/decisions/`.

## Documentacao de carreira/projeto

- Plano de commits para publicar de forma profissional: `docs/commit-plan.md`
- Checklist final de publicacao: `docs/publish-checklist.md`

## Licenca

Este projeto usa a licenca definida no repositorio.
