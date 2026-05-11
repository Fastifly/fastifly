# openapi-typescript TypeScript 6 Peer Warning

Status: closed
Severity: non-blocking
Blocking milestone: before adding `pnpm peers check` to CI
Resolved: 2026-05-11

## Why It Matters

The repository uses TypeScript `latest`, currently resolving to TypeScript 6.x. The current `openapi-typescript` release declares a peer dependency on TypeScript `^5.x`, so `pnpm peers check` exits with an unmet peer warning.

This does not block the current shadcn/ui setup, web typecheck, tests, or build, but it should be resolved before peer dependency checks become part of CI.

## Affected Docs/Code

- root `package.json`
- `pnpm-lock.yaml`
- OpenAPI generation workflow

## Applied Fix

Added a targeted pnpm peer-dependency rule in `pnpm-workspace.yaml`:

```yaml
peerDependencyRules:
  allowedVersions:
    "openapi-typescript>typescript": "6"
```

This keeps TypeScript 6.x as the project baseline while explicitly acknowledging the known-compatible toolchain pairing.

## Verification

- `pnpm peers check` now passes with no peer issues.
- `pnpm api:generate` still succeeds with the existing `openapi-typescript` workflow.
