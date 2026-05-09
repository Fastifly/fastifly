# Static Serving Deferred To Frontend/PWA Phase

## Why It Matters

Phase 3 requires the API shell to either serve static frontend assets or explicitly defer that work. The current API correctly exposes health, readiness, OpenAPI, Scalar, auth, CSRF, and standard errors, but there is no frontend build artifact yet.

Serving static files too early would add placeholder behavior that cannot be tested against the real Vite build or PWA cache policy.

## Affected Docs/Code

- `docs/specs/implementation-start.md`
- `apps/api/src/app.ts`
- future `apps/web` build output
- future Fastify static asset registration

## Suggested Fix

During Phase 8, add the real Vite frontend build and register static serving through the official Fastify static-file plugin. The route must avoid caching sensitive API/auth/import/export/backup responses and must align with the PWA cache policy.

## Blocking Milestone

Phase 8: Frontend and PWA shell.
