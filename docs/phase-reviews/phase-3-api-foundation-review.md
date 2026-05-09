# Phase 3 API Foundation Review

Date: 2026-05-09

Reviewed commit: `27b0be0 feat: add api foundation`

Decision: proceed after the follow-up fixes listed below are applied and verified.

## Files Reviewed

- `apps/api/package.json`
- `apps/api/src/app.ts`
- `apps/api/src/config.ts`
- `apps/api/src/context.ts`
- `apps/api/src/errors.ts`
- `apps/api/src/routes/system.ts`
- `apps/api/src/schemas.ts`
- `apps/api/src/server.ts`
- `apps/api/src/__tests__/app.test.ts`
- `apps/api/vitest.config.ts`
- `pnpm-workspace.yaml`

## Sources Checked

Context7:

- Fastify docs: app testing with `inject`, validation error behavior, custom error handler behavior.
- `fastify-type-provider-zod` docs: `validatorCompiler`, `serializerCompiler`, `jsonSchemaTransform`, Zod v4 import, OpenAPI integration.

Online:

- Fastify testing and server docs: `https://fastify.dev/docs/v5.0.x/Guides/Testing/`, `https://fastify.dev/docs/v5.5.x/Reference/Server/`
- Fastify type provider docs: `https://fastify.dev/docs/v5.6.x/Reference/Type-Providers/`
- `fastify-type-provider-zod` README: `https://github.com/turkerdev/fastify-type-provider-zod`
- `@fastify/swagger` README: `https://github.com/fastify/fastify-swagger`
- `@fastify/csrf-protection` README: `https://github.com/fastify/csrf-protection`

## CTO Review

Finding: `fix first` - Phase 3 says static serving placeholder is part of delivery, but the API foundation commit does not cover it.

Impact: low now, but it creates ambiguity when frontend/PWA work starts.

Decision: do not add fake static serving. Mark it explicitly deferred until a frontend build artifact exists.

Finding: `proceed` - The Fastify app factory, config validation, request IDs, OpenAPI endpoint, Scalar docs, health/readiness, auth context slot, authz ability slot, cookie registration, and CSRF registration are in place.

## Senior Software Engineer Review

Finding: `fix first` - `registerErrorHandlers` maps all non-validation 4xx errors to `BAD_REQUEST`.

Impact: future auth and domain routes could throw 401, 403, 404, or 409 but serialize the wrong API error code.

Decision: preserve standard status-to-code mappings now, before Phase 4 auth work depends on it.

Finding: `proceed` - Zod compiler setup and Swagger transform match current `fastify-type-provider-zod` guidance. Inject tests close app instances and cover health, readiness, OpenAPI, not-found, and validation error serialization.

Finding: `proceed with note` - CSRF is registered as a strategy slot, not applied globally. That is correct for this phase because safe route-level enforcement should be added with mutating authenticated routes.

## User Review

Finding: `fix first` - The user-visible API behavior needs stable standard error codes before login/session/workspace work starts.

Impact: inconsistent error codes would create confusing frontend states and brittle contract fixtures.

Decision: add tests for representative status mappings.

Finding: `proceed` - `/health`, `/ready`, and `/api/openapi.json` are enough visible API surface for this phase.

## Verification Already Run

Before this review:

```text
pnpm --filter @fastifly/api typecheck
pnpm --filter @fastifly/api typecheck:tsc
pnpm --filter @fastifly/api test
pnpm lint
pnpm typecheck
pnpm build
pnpm test
pnpm test:sqlite
pnpm test:postgres
```

All passed before the review findings were recorded.

## Required Follow-Up Before Phase 4

1. Preserve standard 400/401/403/404/409/500 API error codes in the API error handler.
2. Add tests for the important non-validation status mappings.
3. Keep static serving deferred explicitly until frontend/PWA build output exists.

## Follow-Up Applied

- Standard 401, 403, and 409 error-code preservation was added to the API error handler.
- API tests now cover representative auth, permission, and conflict status mappings.
- `docs/implementation-start.md` now states that static serving is explicitly deferred when no frontend build artifact exists.
