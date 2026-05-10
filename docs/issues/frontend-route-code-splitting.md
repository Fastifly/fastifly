# Frontend Route Code Splitting

Status: open
Severity: non-blocking for current shadcn migration, blocking before mobile performance hardening

## Why It Matters

The web production build currently emits a Vite warning because the main client chunk is larger than 500 kB after minification. This can slow first load on mobile devices, especially when the app grows beyond the current dashboard/auth/transaction screens.

## Affected Docs/Code

- `apps/web/src/ui/app-shell.tsx`
- `apps/web/src/ui/transaction-create-panel.tsx`
- `apps/web/src/main.tsx`
- `docs/specs/frontend-v2.md`
- `docs/specs/pwa-mobile.md`

## Suggested Fix

Introduce route-level and feature-level code splitting once the route tree stabilizes:

- lazy-load non-primary screens such as reports/settings/advanced workflows
- keep auth and dashboard startup paths small
- split heavy form/report/import modules behind route boundaries
- add a bundle-size check or documented budget before mobile hardening

## Blocking Milestone

Resolve before declaring the PWA/mobile frontend performance-ready.
