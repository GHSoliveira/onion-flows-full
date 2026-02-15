# Arquitetura do Onion Web Flows

## Visao geral

O sistema segue separacao por camadas com deploy independente:

- `client/`: SPA React para operacao e administracao.
- `server/`: API Express com regras de negocio, autenticacao e integracoes.
- `MongoDB`: persistencia principal dos dados de tenant, fluxo e operacao.

## Fronteiras

- Frontend consome API REST e eventos em tempo real via Socket.IO.
- Backend aplica autenticacao JWT e autorizacao por papel.
- Multi-tenant e tratado no backend para evitar acesso cruzado entre empresas.

## Decisoes de design

- Separacao client/server para facilitar escala horizontal independente.
- Validacao de entrada no backend para reduzir falhas e abuso de API.
- Observabilidade com logs e health endpoint para operacao em producao.

## Fluxo principal

1. Usuario autentica em `POST /api/auth/login`.
2. Frontend recebe token e inicializa contexto de sessao.
3. Usuario manipula fluxos/telas administrativas.
4. Backend valida permissao e tenant em cada operacao critica.

## Riscos conhecidos

- Ausencia de suite de testes automatizados no estado atual.
- Dependencia de variaveis de ambiente para integracoes externas.
- Necessidade de maior cobertura de monitoramento em cenarios de pico.
