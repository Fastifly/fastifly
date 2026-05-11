import { Outlet } from "@tanstack/react-router";

import { AppShell } from "../app-shell";

export function AppLayoutRouteComponent() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
