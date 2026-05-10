# Fastifly

**Fast personal finance, without losing control.**

Fastifly is a modern, self-hosted personal finance app built for fast daily use, clean dashboards, multi-currency support, and a serious ledger-ready foundation underneath.

> **Status:** Pre-alpha / early development  
> Fastifly is not production-ready yet. Expect breaking changes.

---

## Contents

- [Why Fastifly?](#why-fastifly)
- [Features](#features)
- [Screenshots](#screenshots)
- [Tech stack](#tech-stack)
- [Quick start](#quick-start)
- [Development setup](#development-setup)
- [Configuration](#configuration)
- [Project structure](#project-structure)
- [Documentation](#documentation)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [License](#license)
- [Disclaimer](#disclaimer)

---

## Why Fastifly?

Most personal finance apps fall into one of two groups:

- simple apps that are easy to start but hard to grow with
- powerful apps that are flexible but feel complex too early

Fastifly aims for the middle:

```text
Simple by default.
Powerful when needed.
Self-hosted from day one.
```

The first releases focus on accounts, transactions, categories, budgets, imports, reports, and a polished responsive UI. The architecture is designed to support deeper finance workflows later without forcing complexity into the first-time user experience.

---

## Features

### Planned for early releases

- Accounts and balances
- Transactions: income, expense, and transfer
- Categories and tags
- Budgets
- Dashboard and basic reports
- Installable PWA with limited offline writes
- Device registration and outbox sync
- CSV import with preview
- Multi-currency support
- SQLite and PostgreSQL support
- Dark mode
- Responsive web UI
- REST API with OpenAPI documentation
- DB-backed background jobs

### Designed for future growth

- Advanced rules
- Recurring transactions
- Split transactions
- Reconciliation
- Multi-ledger support
- Shared workspaces
- Roles and permissions
- Audit log
- Advanced reports
- Backup and restore tools
- API tokens
- Conflict resolution and deeper sync

---

## Screenshots

Screenshots and demo GIFs will be added once the first usable UI is available.

Planned screenshots:

- Dashboard
- Transaction entry
- Accounts
- Budgets
- Import preview
- Reports
- Mobile layout
- Dark mode

---

## Tech stack

### Backend

- Node.js 24 LTS
- TypeScript
- Fastify
- Zod v4
- Drizzle ORM v1 beta/RC
- better-sqlite3
- PostgreSQL 18
- OpenAPI + Scalar API Reference

### Frontend

- Vite
- React
- TypeScript
- TanStack Router
- TanStack Query
- TanStack Form
- Tailwind CSS
- shadcn/ui

### Database modes

Fastifly supports both database modes as first-class targets:

```text
SQLite      → default, easiest self-hosting
PostgreSQL  → larger installs and serious deployments
```

Fastifly does not require Redis, BullMQ, Kafka, Elasticsearch, or external queue services in the initial architecture.

---

## Quick start

### Local development with Tilt

The easiest way to run the app locally is:

```bash
pnpm install
pnpm start
```

`pnpm start` runs Tilt on port `10360` and starts the default SQLite demo stack.
Open Tilt at:

```text
http://localhost:10360
```

Tilt then manages:

- local package builds
- SQLite data directory creation
- database migrations
- seeded demo data
- the Fastify API
- the Vite web app

Service links:

```text
Web:  http://localhost:5173
API:  http://localhost:3400
Docs: http://localhost:3400/api/docs
```

Demo login:

```text
Username: owner
Password: password
```

The same demo login values are defined once in `packages/common/src/demo-login.ts`
and reused by DB seeds and the web login screen.

For SQLite without seeded demo data, use:

```bash
pnpm dev:sqlite
```

For the full demo dataset explicitly:

```bash
pnpm dev:sqlite:demo
```

To clean or seed the currently running Tilt database:

```bash
pnpm db:clean
pnpm db:seed
```

These trigger Tilt's manual `db-clean` and `db-seed` resources on port `10360`.
Both commands use the active Tilt database mode and connection URL. If Tilt was
started with `FASTIFLY_DEV_SEED=none`, `pnpm db:seed` uses the full `e2e` demo
seed.

Tilt uses fixed development ports. If a port is busy, stop the conflicting
process before running Tilt.

### PostgreSQL development

To run the same dev app against a local PostgreSQL container:

```bash
pnpm dev:postgres
```

For the full demo dataset against PostgreSQL:

```bash
pnpm dev:postgres:demo
```

This command starts `docker-compose.dev-postgres.yml`, waits for PostgreSQL,
builds local runtime packages, runs migrations, then starts the API and web app
through Tilt.
It uses port `55432` by default to avoid conflicting with a local PostgreSQL
install.

Stop only the Postgres dev database with:

```bash
pnpm dev:postgres:down
```

### Production image preview

The production Docker image flow will be finalized after the first runnable
release.

Expected Docker usage:

```bash
docker run \
  -p 3000:3000 \
  -v ./data:/app/data \
  -e DATABASE_DRIVER=sqlite \
  -e DATABASE_URL=/app/data/fastifly.db \
  -e SESSION_SECRET=change-me \
  ghcr.io/fastifly-hq/fastifly:latest
```

Then open:

```text
http://localhost:3000
```

> The Docker image is not published yet.

---

## Development setup

### Requirements

- Node.js 24 LTS
- pnpm
- Tilt
- Docker, only for `pnpm dev:postgres` or production Compose testing
- Biome for linting and formatting
- tsgo via `@typescript/native-preview` for fast type-checking
- SQLite
- PostgreSQL 18, optional for PostgreSQL mode

### Install dependencies

```bash
pnpm install
```

### Start development with a database

Default SQLite demo mode:

```bash
pnpm start
```

Tilt UI:

```text
http://localhost:10360
```

SQLite without seeded demo data:

```bash
pnpm dev:sqlite
```

SQLite with seeded demo data:

```bash
pnpm dev:sqlite:demo
```

PostgreSQL mode with a local Docker database:

```bash
pnpm dev:postgres
```

PostgreSQL with seeded demo data:

```bash
pnpm dev:postgres:demo
```

Expected local services:

```text
API:  http://localhost:3400
Web:  http://localhost:5173
Docs: http://localhost:3400/api/docs
```

Tilt uses fixed local ports by default. Override them with `APP_PORT`,
`FASTIFLY_WEB_PORT`, or `FASTIFLY_DEV_POSTGRES_PORT` before starting Tilt.

### Planned scripts

```bash
pnpm start
pnpm dev
pnpm dev:sqlite
pnpm dev:sqlite:demo
pnpm dev:postgres
pnpm dev:postgres:demo
pnpm dev:postgres:down
pnpm build
pnpm api:generate
pnpm api:check

pnpm lint
pnpm lint:fix
pnpm format
pnpm typecheck
pnpm typecheck:tsc
pnpm test

pnpm db:generate:sqlite
pnpm db:generate:postgres
pnpm db:migrate:sqlite
pnpm db:migrate:postgres
pnpm db:clean
pnpm db:seed
pnpm db:seed:essential
pnpm db:seed:demo
pnpm db:seed:e2e

pnpm test:sqlite
pnpm test:postgres
pnpm test:postgres:runtime
```

---

## Configuration

Create an `.env` file.

### SQLite mode

```env
APP_ENV=development
APP_PORT=3400
APP_URL=http://localhost:3400
FASTIFLY_API_PROXY_TARGET=http://localhost:3400
VITE_FASTIFLY_API_BASE_URL=

DATABASE_DRIVER=sqlite
DATABASE_URL=./data/fastifly.dev.db

SESSION_SECRET=development-only-session-secret-change-before-prod
COOKIE_SECURE=false

LOG_LEVEL=debug
AUTO_MIGRATE=false
```

### PostgreSQL mode

```env
APP_ENV=development
APP_PORT=3400
APP_URL=http://localhost:3400
FASTIFLY_API_PROXY_TARGET=http://localhost:3400
VITE_FASTIFLY_API_BASE_URL=

DATABASE_DRIVER=postgres
DATABASE_URL=postgres://fastifly:fastifly@localhost:55432/fastifly?sslmode=disable

SESSION_SECRET=development-only-session-secret-change-before-prod
COOKIE_SECURE=false

LOG_LEVEL=debug
AUTO_MIGRATE=false
```

---

## Project structure

```text
apps/
├── api/          # Fastify backend
└── web/          # Vite React frontend

packages/
├── common/       # shared types, enums, Zod schemas, money, ID, sync, API contracts
├── authz/        # shared authorization roles, actions, subjects, policies
├── db/           # Drizzle schemas, migrations, database clients
└── config/       # shared configuration helpers
```

Important architecture notes:

- The UI should be simple by default, with advanced controls available when needed.
- The backend should use a ledger-ready model from day one.
- Money must never be stored as floating point values.
- Synced domain objects should use client-generated UUIDv7-compatible text IDs.
- v0.1 includes device registration and a limited offline outbox for safe domain commands.
- SQLite and PostgreSQL support must be tested separately.
- Shared validation, enums, and DTOs should live in `packages/common`.

Detailed architecture belongs in the `docs/` directory, not in this README.

---

## Documentation

Planned documentation:

```text
docs/
├── README.md
├── architecture-v2.md
├── database-v2.md
├── api-v2.md
├── sync-v1.md
├── frontend-v2.md
├── implementation-start.md
├── pwa-mobile.md
├── maintenance-v2.md
├── prd/
├── deployment.md
├── backup-restore.md
└── decisions/
```

Useful files once available:

- `AGENTS.md` — development rules for AI agents and contributors
- `CONTRIBUTING.md` — contribution workflow
- `CODE_OF_CONDUCT.md` — community behavior guidelines
- `SECURITY.md` — responsible disclosure policy

---

## Roadmap

### Phase 0 — Foundation

- pnpm workspace
- Fastify API
- Vite React app
- shared common package
- SQLite and PostgreSQL setup
- OpenAPI docs
- Docker setup

### Phase 1 — Core finance

- auth
- workspaces
- ledgers
- accounts
- transactions
- categories
- tags
- dashboard

### Phase 2 — Daily-use polish

- responsive transaction entry
- dark theme
- language foundation
- reports
- simple and advanced UI views

### Phase 3 — Imports and budgets

- CSV upload
- import preview
- duplicate detection
- import commit
- undo import batch
- budgets

### Phase 4 — Automation and power features

- DB-backed jobs
- recurring transactions
- rules
- reconciliation
- advanced reports
- audit log

---

## Contributing

Contributions will be welcome once the initial foundation is ready.

Before contributing, please read:

- `CONTRIBUTING.md`
- `AGENTS.md`
- `docs/specs/architecture-v2.md`
- `docs/specs/database-v2.md`
- `docs/specs/api-v2.md`
- `docs/specs/sync-v1.md`

---

## License

License: **TBD**

The license will be finalized before the first public stable release.

---

## Disclaimer

Fastifly is personal finance software. It is not financial, tax, accounting, or investment advice. Always verify important financial records independently.
