# Frontend Route Code Splitting

Status: resolved
Resolved in phase: 7
Severity: closed

## Why It Mattered

The web build previously emitted a >500kB main chunk warning, which was a mobile performance risk.

## Applied Fix

- switched router to lazy route components with `lazyRouteComponent()` in
  `apps/web/src/router.tsx`
- introduced lazy route modules under `apps/web/src/ui/routes/`:
  - `app-layout-route.tsx`
  - `login-route.tsx`
  - route marker modules for dashboard/accounts/transactions/budgets/reports/settings

## Validation

`pnpm --filter @fastifly/web build` now outputs split chunks without the Vite large-chunk warning.

Notable output snapshot:

- `dist/assets/index-CE1e5lar.js` -> `273.00 kB`
- `dist/assets/app-layout-route-CMcNHqzL.js` -> `166.63 kB`
- `dist/assets/auth-components-C60StYIb.js` -> `191.37 kB`

## Acceptance

- route-level lazy loading is in place for auth and primary navigation routes
- mobile-first chunk pressure is reduced and no longer blocked by a single oversized main bundle
