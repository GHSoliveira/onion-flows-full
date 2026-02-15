# ADR 001 - Separacao client/server com deploy independente

## Status

Aceito

## Contexto

O produto possui interface rica (editor de fluxo, dashboards, simulador) e backend com autenticacao, multi-tenant e integracoes de canal.

## Decisao

Adotar dois aplicativos independentes:

- Frontend React publicado no Vercel.
- Backend Node.js publicado no Render.

## Consequencias

Positivas:

- Escalabilidade por camada.
- Deploy mais rapido por dominio de mudanca.
- Menor acoplamento entre UI e API.

Negativas:

- Maior cuidado com CORS e variaveis de ambiente.
- Observabilidade distribuida entre provedores.
