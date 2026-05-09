# Contributing to Fastifly

Thank you for your interest in contributing to Fastifly.

Fastifly is a modern, self-hosted personal finance app designed to be simple by default and powerful when needed. The project is currently in early development, so architecture, APIs, and database schemas may change before the first stable release.

---

## Project status

Fastifly is currently **pre-alpha**.

This means:

- breaking changes are expected
- not all planned features exist yet
- documentation may be incomplete
- database migrations may change frequently
- public APIs are not stable yet

Please check the roadmap and open issues before starting a large contribution.

---

## How to contribute

Good first contributions include:

- documentation improvements
- UI polish
- accessibility fixes
- test coverage
- small bug fixes
- empty/loading/error states
- validation improvements
- database migration fixes
- mobile responsive fixes

For larger changes, open an issue or discussion first.

Examples of larger changes:

- new database tables
- new backend modules
- new accounting/ledger behavior
- new import pipeline behavior
- new authentication behavior
- new report engine behavior
- new dependency with runtime impact
- major UI navigation changes

---

## Development setup

### Requirements

- Node.js 24 LTS
- pnpm
- SQLite
- PostgreSQL 18, optional for PostgreSQL-mode development

### Install dependencies

```bash
pnpm install
```

### Start development

```bash
pnpm dev
```

Expected local services:

```text
API:  http://localhost:3000
Web:  http://localhost:5173
Docs: http://localhost:3000/api/docs
```

---

## Branch naming

Use clear branch names:

```text
feature/accounts-api
feature/mobile-transaction-form
fix/sqlite-migration
fix/money-formatting
docs/database-notes
test/ledger-invariants
```

---

## Commit style

Use concise, descriptive commits.

Preferred format:

```text
type(scope): summary
```

Examples:

```text
feat(accounts): add account archive endpoint
fix(db): enable SQLite foreign keys on startup
docs(readme): clarify PostgreSQL setup
test(ledger): cover split transaction balancing
refactor(api): move validation into shared schema
```

Common types:

```text
feat
fix
docs
test
refactor
chore
perf
security
```

---

## Pull request checklist

Before opening a pull request, verify:

- [ ] Code is formatted
- [ ] TypeScript passes
- [ ] Linting passes
- [ ] Tests pass
- [ ] SQLite tests pass if database logic changed
- [ ] PostgreSQL tests pass if database logic changed
- [ ] New API routes have request and response validation
- [ ] New API routes appear in OpenAPI docs
- [ ] New UI screens include loading, empty, error, and success states
- [ ] New UI screens work on mobile
- [ ] New database changes include migrations for SQLite and PostgreSQL
- [ ] Money values are not stored or calculated as floating point values
- [ ] Shared types/schemas/enums were added to `packages/common` where appropriate
- [ ] Documentation was updated when behavior changed

---

## Architecture rules

Fastifly is a modular monolith.

Do not introduce microservices, Redis, BullMQ, Kafka, Elasticsearch, or other infrastructure-heavy dependencies without an architecture decision record.

Preferred default:

```text
single app process
SQLite or PostgreSQL
DB-backed jobs
static frontend served by backend in production
```

---

## Backend contribution rules

Backend code should follow this flow:

```text
route
  -> service/use-case
  -> repository
  -> database
```

### Route handlers

Route handlers should handle:

- auth guard
- request validation
- calling a service
- response formatting

Route handlers should not contain business logic.

### Services

Services should contain business rules.

Examples:

- create transaction
- calculate account balance
- apply rule
- commit import batch
- generate recurring transaction
- validate ledger postings

### Repositories

Repositories hide database details from services.

Services should not import Drizzle table objects directly.

---

## Frontend contribution rules

Frontend code should use:

- React
- TypeScript
- TanStack Router
- TanStack Query
- TanStack Form
- Zod v4
- Tailwind CSS
- shadcn/ui

### UI requirements

Every screen should include:

- loading state
- empty state
- error state
- success state where applicable
- mobile layout
- dark theme compatibility

### Forms

Use TanStack Form with shared Zod schemas from `packages/common` when possible.

Do not duplicate validation logic in the frontend if it can live in `packages/common`.

---

## Database contribution rules

Fastifly supports both SQLite and PostgreSQL.

When changing the database:

- add or update SQLite schema/migrations
- add or update PostgreSQL schema/migrations
- update shared types and schemas if needed
- run tests against both databases
- avoid database-specific behavior in business logic

SQLite and PostgreSQL can have dialect-specific schema files, but business logic should not be duplicated.

---

## Money handling rules

Never use floating point numbers for money.

Use integer minor units:

```text
₹125.50  -> 12550
$10.99   -> 1099
¥500     -> 500
```

API payloads should serialize large money values as strings when needed.

Example:

```json
{
  "amountMinor": "12550",
  "currencyCode": "INR"
}
```

---

## Ledger rules

The UI can be simple, but the backend must remain ledger-safe.

Important invariants:

- postings in a journal must balance
- same-currency journals must sum to zero
- cross-currency journals must preserve original currency values
- exchange-rate snapshots must be stored for cross-currency transactions
- account balances must be derived from postings
- reconciled transactions require extra care before editing

Any feature that touches transactions must include tests for ledger invariants.

---

## Documentation

Update documentation when changing:

- setup steps
- environment variables
- database behavior
- API behavior
- architecture rules
- deployment strategy
- security-sensitive behavior

Main documentation locations:

```text
README.md
AGENTS.md
docs/README.md
docs/architecture-v2.md
docs/database-v2.md
docs/api-v2.md
docs/sync-v1.md
docs/frontend-v2.md
docs/pwa-mobile.md
docs/deployment.md
docs/backup-restore.md
```

---

## Security

Do not open public issues containing secrets or vulnerabilities.

Security-sensitive changes include:

- authentication
- sessions
- password hashing
- permission checks
- workspace isolation
- import parsing
- file uploads
- database backups
- audit logging
- API tokens

A `SECURITY.md` policy will be added before the first public stable release.

---

## Licensing

The project license is currently TBD.

Do not copy code, UI assets, text, icons, branding, or documentation from other finance apps unless the license is compatible and attribution requirements are satisfied.

Do not copy Firefly III, Actual Budget, Maybe Finance, or any other app’s protected branding or UI assets.

---

## Code of conduct

A `CODE_OF_CONDUCT.md` file will be added before wider public contribution begins.

Until then, keep discussions respectful, practical, and focused on improving the project.
