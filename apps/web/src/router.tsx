import { createRootRoute, createRoute, createRouter, Outlet } from "@tanstack/react-router";
import { AppShell } from "./ui/app-shell";
import { AuthPage } from "./ui/auth-page";
import { testIds } from "./testing/testid-registry";

const rootRoute = createRootRoute({
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: () => <RouteMarker data-testid={testIds.routes.dashboardRoute} />,
});

const accountsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/accounts",
  component: () => <RouteMarker data-testid={testIds.routes.accountsRoute} />,
});

const transactionsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/transactions",
  component: () => <RouteMarker data-testid={testIds.routes.transactionsRoute} />,
});

const budgetsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/budgets",
  component: () => <RouteMarker data-testid={testIds.routes.budgetsRoute} />,
});

const reportsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/reports",
  component: () => <RouteMarker data-testid={testIds.routes.reportsRoute} />,
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  component: () => <RouteMarker data-testid={testIds.routes.settingsRoute} />,
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  component: () => (
    <>
      <AuthPage />
      <div className="sr-only" data-testid={testIds.routes.loginRoute} />
    </>
  ),
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  accountsRoute,
  transactionsRoute,
  budgetsRoute,
  reportsRoute,
  settingsRoute,
  loginRoute,
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

function RouteMarker({
  className = "sr-only",
  "data-testid": testId,
}: {
  className?: string;
  "data-testid": string;
}) {
  return <div className={className} data-testid={testId} aria-hidden="true" />;
}
