import { testIds } from "@/testing/testid-registry";
import { RouteMarker } from "./route-marker";

export function AccountsRouteComponent() {
  return <RouteMarker data-testid={testIds.routes.accountsRoute} />;
}
