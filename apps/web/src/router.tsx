import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  Outlet,
} from "@tanstack/react-router";
import { NuqsAdapter } from "nuqs/adapters/tanstack-router";

const rootRoute = createRootRoute({
  component: () => (
    <NuqsAdapter>
      <Outlet />
    </NuqsAdapter>
  ),
});

const appLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "app-layout",
  component: lazyRouteComponent(
    () => import("./ui/routes/app-layout-route"),
    "AppLayoutRouteComponent",
  ),
});

const indexRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/",
  component: lazyRouteComponent(
    () => import("./ui/routes/dashboard-route"),
    "DashboardRouteComponent",
  ),
});

const accountsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/accounts",
  component: lazyRouteComponent(
    () => import("./ui/routes/accounts-route"),
    "AccountsRouteComponent",
  ),
});

const categoriesRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/categories",
  component: lazyRouteComponent(
    () => import("./ui/routes/categories-route"),
    "CategoriesRouteComponent",
  ),
});

const transactionsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/transactions",
  component: lazyRouteComponent(
    () => import("./ui/routes/transactions-route"),
    "TransactionsRouteComponent",
  ),
});

const budgetsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/budgets",
  component: lazyRouteComponent(() => import("./ui/routes/budgets-route"), "BudgetsRouteComponent"),
});

const importsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/imports",
  component: lazyRouteComponent(() => import("./ui/routes/imports-route"), "ImportsRouteComponent"),
});

const rulesRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/rules",
  component: lazyRouteComponent(() => import("./ui/routes/rules-route"), "RulesRouteComponent"),
});

const recurringRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/recurring",
  component: lazyRouteComponent(
    () => import("./ui/routes/recurring-route"),
    "RecurringRouteComponent",
  ),
});

const reportsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/reports",
  component: lazyRouteComponent(() => import("./ui/routes/reports-route"), "ReportsRouteComponent"),
});

const syncRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/sync",
  component: lazyRouteComponent(() => import("./ui/routes/sync-route"), "SyncRouteComponent"),
});

const settingsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/settings",
  component: lazyRouteComponent(
    () => import("./ui/routes/settings-route"),
    "SettingsRouteComponent",
  ),
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  component: lazyRouteComponent(() => import("./ui/routes/login-route"), "LoginRouteComponent"),
});

const routeTree = rootRoute.addChildren([
  appLayoutRoute.addChildren([
    indexRoute,
    accountsRoute,
    categoriesRoute,
    transactionsRoute,
    budgetsRoute,
    importsRoute,
    rulesRoute,
    recurringRoute,
    reportsRoute,
    syncRoute,
    settingsRoute,
  ]),
  loginRoute,
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
