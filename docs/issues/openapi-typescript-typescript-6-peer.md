# openapi-typescript TypeScript 6 Peer Warning

Status: open
Severity: non-blocking
Blocking milestone: before adding `pnpm peers check` to CI

## Why It Matters

The repository uses TypeScript `latest`, currently resolving to TypeScript 6.x. The current `openapi-typescript` release declares a peer dependency on TypeScript `^5.x`, so `pnpm peers check` exits with an unmet peer warning.

This does not block the current shadcn/ui setup, web typecheck, tests, or build, but it should be resolved before peer dependency checks become part of CI.

## Affected Docs/Code

- root `package.json`
- `pnpm-lock.yaml`
- OpenAPI generation workflow

## Suggested Fix

Track `openapi-typescript` releases and either:

- upgrade when it supports TypeScript 6, or
- pin TypeScript to a supported 5.x release if OpenAPI generation becomes unstable.

Do not suppress the peer warning without proving OpenAPI generation works in CI.
