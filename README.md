# Delego Backend

<div align="center">

**Backend microservices, agents, and shared SDK for [Delego](https://github.com/DelegoLabs/Delego) — AI-Powered Delegated Commerce on Stellar**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)](https://www.typescriptlang.org/)
[![Node](https://img.shields.io/badge/Node-%3E%3D20-green)](https://nodejs.org/)

</div>

## 🌟 Overview

This repository contains the backend platform for Delego: the API gateway, orchestration engine, wallet and payments services, AI agents, shared domain types, and the public client SDK. The frontend web application lives in the [Delego](https://github.com/DelegoLabs/Delego) repository and the Soroban smart contracts in [Delego-contracts](https://github.com/DelegoLabs/Delego-contracts).

### 🏗️ Repository Map

| Repository | Purpose |
|---|---|
| [Delego](https://github.com/DelegoLabs/Delego) | Frontend web application (`apps/frontend`), depends on the published `@delego/sdk` and `@delego/types` |
| [Delego-backend](https://github.com/DelegoLabs/Delego-backend) | **This repo** — microservices, agents, shared packages, SDK |
| [Delego-contracts](https://github.com/DelegoLabs/Delego-contracts) | Soroban smart contracts |

```
Delego (web) ──> API Gateway ──> Orchestrator / Wallet / Payments / Notifications
                       │                │
                       │                └──> Agents (buyer-agent, payment-agent)
                       │
                       └──> Soroban Contracts (Delego-contracts) via RPC
```

## 📦 What's Inside

### Services (`apps/backend/`)

| Service | Package | Port | Responsibility |
|---|---|---|---|
| Gateway | `@delego/gateway` | 3000 | Single API entry point: auth (JWT), RBAC, rate limiting, routing |
| Orchestrator | `@delego/orchestrator` | 3010 | Purchase workflow coordination and state machine |
| Wallet | `@delego/wallet` | 3012 | Stellar accounts, Soroban permissions, tx signing/submission |
| Payments | `@delego/payments` | 3014 | Escrow coordination, settlements, refunds |
| Notifications | `@delego/notifications` | 3015 | Email/push notifications with retry (DLQ) |

Each service is independently deployable and exposes `GET /health`.

### Agents (`agents/`)

- `buyer-agent/` — searches products, proposes purchases
- `payment-agent/` — executes delegated payments within permission limits

### Shared Packages (`packages/`)

| Package | Purpose | Published |
|---|---|---|
| `@delego/types` | Shared domain types and interfaces | Yes — consumed by the frontend |
| `@delego/utils` | Shared utilities | Yes |
| `@delego/sdk` | TypeScript client SDK for the Delego API | Yes — consumed by the frontend |

These packages are versioned and published to the package registry so the frontend repository can consume them without a monorepo dependency.

### Data & Infra

- `database/` — migrations, schema, seeds
- `infrastructure/` — deployment, docker, monitoring, terraform
- `scripts/` — setup (migrate/seed), deploy, generation helpers
- `tests/` — unit, integration, and e2e test workspaces

## 🛠️ Development

### Prerequisites

- Node.js `>= 20`
- pnpm `>= 9` (`corepack enable`)
- Docker (for local PostgreSQL/Redis via compose)

### Getting Started

```bash
pnpm install
pnpm docker:up        # start PostgreSQL/Redis
pnpm db:migrate       # apply database migrations
pnpm db:seed          # seed development data
pnpm dev              # run all services and agents
```

### Per-Service Commands

```bash
pnpm dev:gateway
pnpm --filter @delego/wallet dev
```

### Building

```bash
pnpm build
```

### Testing

```bash
pnpm test                    # all workspaces
pnpm test:unit               # unit tests
pnpm test:integration        # integration tests
pnpm test:e2e                # end-to-end tests
```

## 📚 Documentation

- [Services overview](./apps/backend/README.md)
- [Architecture](./ARCHITECTURE.md)
- [Operational runbook (DLQ)](./OPERATIONAL_RUNBOOK_DLQ.md)
- [Email retry DLQ design](./DEPLOYMENT_EMAIL_RETRY_DLQ.md)

## 🤝 Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). Commits follow [Conventional Commits](https://www.conventionalcommits.org/) (enforced via commitlint + husky).

---

**Last Updated**: August 2026
