# Deployment

This document explains the supported deployment model for Fastifly.

Fastifly is designed to be self-hosted with minimal infrastructure.

Official first-class deployment target:

```text
Docker Compose
```

Supported database modes:

```text
SQLite
PostgreSQL 18
```

Fastifly does not require Redis, BullMQ, Kafka, Elasticsearch, or any external queue service.

Ledger-affecting writes are serialized by `LedgerMutationRunner`. The current write-boundary adapter is process-local, so the supported production shape is one writer API process per Fastifly instance. Do not horizontally scale API writers until the distributed ledger write boundary issue is resolved.

---

## Deployment principles

Fastifly production deployments should be:

- simple to run
- easy to back up
- explicit about migrations
- secure behind HTTPS
- persistent across restarts
- clear about where data is stored

Default production shape:

```text
Fastifly app
  + SQLite file
```

Advanced production shape:

```text
Fastifly app
  + PostgreSQL 18
```

---

## Required environment variables

Common variables:

```env
APP_ENV=production
APP_PORT=3000
APP_URL=https://fastifly.example.com

SESSION_SECRET=replace-with-long-random-secret
COOKIE_SECURE=true

LOG_LEVEL=info
AUTO_MIGRATE=false
```

Database variables:

```env
DATABASE_DRIVER=sqlite
DATABASE_URL=/app/data/fastifly.db
```

or:

```env
DATABASE_DRIVER=postgres
DATABASE_URL=postgres://fastifly:fastifly@postgres:5432/fastifly?sslmode=disable
```

Important:

```text
AUTO_MIGRATE=false
```

Production migrations are manual.

---

## SQLite deployment

SQLite is the easiest deployment mode.

Use it for:

- personal use
- family/partner use
- small self-hosted installs
- low-resource VPS/home server deployments

### docker-compose.sqlite.yml

The repository ships a local `docker-compose.sqlite.yml` for this mode. It builds the API
image from the current checkout and keeps migrations as an explicit one-shot service.

```yaml
services:
  fastifly:
    build:
      context: .
      target: production
    image: fastifly:local
    restart: unless-stopped
    ports:
      - "${FASTIFLY_PORT:-3000}:3000"
    environment:
      APP_ENV: production
      HOST: 0.0.0.0
      APP_PORT: 3000
      APP_URL: "${APP_URL:-http://localhost:3000}"
      DATABASE_DRIVER: sqlite
      DATABASE_URL: /app/data/fastifly.db
      SESSION_SECRET: "${SESSION_SECRET:?SESSION_SECRET must be at least 32 characters}"
      COOKIE_SECURE: "${COOKIE_SECURE:-false}"
      AUTO_MIGRATE: "false"
    volumes:
      - fastifly-sqlite-data:/app/data

  fastifly-migrate:
    build:
      context: .
      target: migrations
    image: fastifly:migrations
    profiles:
      - migrate
    environment:
      DATABASE_URL: /app/data/fastifly.db
    command: ["pnpm", "db:migrate:sqlite"]
    volumes:
      - fastifly-sqlite-data:/app/data

volumes:
  fastifly-sqlite-data:
```

Run migrations before the first start and before starting a new version:

```bash
docker compose -f docker-compose.sqlite.yml run --rm fastifly-migrate
```

Start:

```bash
docker compose -f docker-compose.sqlite.yml up -d
```

View logs:

```bash
docker compose -f docker-compose.sqlite.yml logs -f
```

Stop:

```bash
docker compose -f docker-compose.sqlite.yml down
```

### SQLite data location

The SQLite database is stored in:

```text
fastifly-sqlite-data:/app/data/fastifly.db
```

Keep this volume backed up.

---

## PostgreSQL deployment

Use PostgreSQL for:

- larger installs
- shared family/workspace usage with heavier traffic
- long-term production deployments
- users who already run PostgreSQL infrastructure

### docker-compose.postgres.yml

The repository ships a local `docker-compose.postgres.yml` with a PostgreSQL health check and
a separate migration service.

```yaml
services:
  postgres:
    image: postgres:18
    restart: unless-stopped
    environment:
      POSTGRES_DB: fastifly
      POSTGRES_USER: fastifly
      POSTGRES_PASSWORD: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U fastifly -d fastifly"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 20s
    volumes:
      - fastifly-postgres-data:/var/lib/postgresql/data

  fastifly:
    build:
      context: .
      target: production
    image: fastifly:local
    restart: unless-stopped
    depends_on:
      postgres:
        condition: service_healthy
    ports:
      - "${FASTIFLY_PORT:-3000}:3000"
    environment:
      APP_ENV: production
      HOST: 0.0.0.0
      APP_PORT: 3000
      APP_URL: "${APP_URL:-http://localhost:3000}"
      DATABASE_DRIVER: postgres
      DATABASE_URL: "postgres://fastifly:${POSTGRES_PASSWORD}@postgres:5432/fastifly?sslmode=disable"
      SESSION_SECRET: "${SESSION_SECRET:?SESSION_SECRET must be at least 32 characters}"
      COOKIE_SECURE: "${COOKIE_SECURE:-false}"
      AUTO_MIGRATE: "false"

  fastifly-migrate:
    build:
      context: .
      target: migrations
    image: fastifly:migrations
    profiles:
      - migrate
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      DATABASE_URL: "postgres://fastifly:${POSTGRES_PASSWORD}@postgres:5432/fastifly?sslmode=disable"
    command: ["pnpm", "db:migrate:postgres"]

volumes:
  fastifly-postgres-data:
```

Run migrations before the first start and before starting a new version:

```bash
docker compose -f docker-compose.postgres.yml run --rm fastifly-migrate
```

Start:

```bash
docker compose -f docker-compose.postgres.yml up -d
```

View logs:

```bash
docker compose -f docker-compose.postgres.yml logs -f
```

---

## Manual production migrations

Fastifly must not silently change production schema at startup.

Production default:

```env
AUTO_MIGRATE=false
```

Before starting a new version:

```bash
DATABASE_URL=/path/to/fastifly.db pnpm db:migrate:sqlite
DATABASE_URL=postgres://fastifly:...@host:5432/fastifly pnpm db:migrate:postgres
```

With Docker:

```bash
docker compose -f docker-compose.sqlite.yml run --rm fastifly-migrate
docker compose -f docker-compose.postgres.yml run --rm fastifly-migrate
```

Required production upgrade order:

```text
1. Read release notes.
2. Back up database.
3. Pull new image.
4. Run migration status.
5. Run migration up.
6. Restart app.
7. Check /ready.
```

Never run production migrations without a backup.

---

## Health checks

Fastifly exposes:

```text
GET /health
GET /ready
```

### `/health`

Checks whether the process is alive.

Should not require database access.

### `/ready`

Checks whether the app is ready to serve traffic.

Should verify:

- database connection
- required schema/migration state
- configuration validity

Example:

```bash
curl http://localhost:3000/health
curl http://localhost:3000/ready
```

---

## Reverse proxy

Fastifly should run behind HTTPS in production.

Recommended reverse proxies:

- Caddy
- Nginx
- Traefik

### Caddy example

```caddyfile
fastifly.example.com {
  reverse_proxy localhost:3000
}
```

### Nginx example

```nginx
server {
  listen 443 ssl http2;
  server_name fastifly.example.com;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;

    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto https;
  }
}
```

Required production config behind HTTPS:

```env
APP_URL=https://fastifly.example.com
COOKIE_SECURE=true
```

---

## Persistent volumes

SQLite:

```text
./data:/app/data
```

PostgreSQL:

```text
postgres_data:/var/lib/postgresql/data
```

Do not store production data only inside an ephemeral container filesystem.

---

## Logs

Fastifly uses structured logs.

Recommended production log level:

```env
LOG_LEVEL=info
```

Debug logs may leak too much context and should not be used in production unless troubleshooting.

Never log:

- passwords
- passkey secrets
- recovery codes
- session tokens
- raw invite tokens
- authorization headers
- financial file contents

---

## No email requirement

Fastifly v0.1 does not require email support.

Implications:

- no SMTP setup
- no email verification
- no email password reset
- no email invitations

Family/partner invitations use copyable invite links.

Password recovery uses:

- admin CLI reset
- recovery codes

---

## No telemetry

Fastifly does not send telemetry by default.

Production deployments should not require:

- analytics service
- error-reporting SaaS
- usage tracking endpoint

Any future telemetry must be opt-in.

---

## PWA deployment notes

Fastifly is served as a PWA-capable web app.

Production deployment should ensure:

- HTTPS is enabled
- `APP_URL` is correct
- service worker files are served correctly
- caching headers do not break service worker updates
- reverse proxy does not block manifest/icon files

---

## Upgrade checklist

Before upgrading:

- [ ] Read release notes
- [ ] Confirm current version
- [ ] Create database backup
- [ ] Pull new image
- [ ] Run migration status
- [ ] Run migration up
- [ ] Restart app
- [ ] Check `/health`
- [ ] Check `/ready`
- [ ] Log in and verify dashboard
- [ ] Verify latest transactions
- [ ] Verify background jobs

---

## Production readiness checklist

A deployment is production-ready when:

- [ ] HTTPS is enabled
- [ ] `COOKIE_SECURE=true`
- [ ] `SESSION_SECRET` is strong and unique
- [ ] `AUTO_MIGRATE=false`
- [ ] Backups are configured
- [ ] Restore process has been tested
- [ ] `/health` works
- [ ] `/ready` works
- [ ] Logs are collected
- [ ] Data volume is persistent
- [ ] Database credentials are not defaults
- [ ] Admin recovery method is documented
