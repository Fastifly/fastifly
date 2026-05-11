# Static Serving Deferred To Frontend/PWA Phase

Status: resolved
Phase: 8
Severity: previously blocking before single-origin production deploys that serve web from API runtime

## Why It Matters

Phase 3 requires the API shell to either serve static frontend assets or explicitly defer that work. The current API correctly exposes health, readiness, OpenAPI, Scalar, auth, CSRF, and standard errors, but there is no frontend build artifact yet.

Serving static files too early would add placeholder behavior that cannot be tested against the real Vite build or PWA cache policy.

## Affected Docs/Code

- `docs/specs/implementation-start.md`
- `apps/api/src/app.ts`
- future `apps/web` build output
- future Fastify static asset registration

## Resolution

Implemented on 2026-05-11:

- added `@fastify/static` integration behind explicit config flags:
  - `SERVE_WEB_STATIC=true`
  - `WEB_STATIC_ROOT=/absolute/path/to/apps/web/dist`
- static plugin now serves built web assets with long-cache defaults for hashed bundles
- `/`, `/*` SPA fallback paths serve `index.html` with non-immutable zero-age caching
- `sw.js` and `manifest.webmanifest` have explicit cache behavior for update safety
- `/api/*`, `/health`, and `/ready` remain backend-owned and never fall through to SPA HTML
- API app tests now verify SPA fallback and backend 404 behavior while static serving is enabled

## Blocking Milestone

No longer blocking Phase 8.
