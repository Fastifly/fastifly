import { testIds } from "@/testing/testid-registry";
import { RouteMarker } from "./route-marker";

export function TransactionsRouteComponent() {
  return <RouteMarker data-testid={testIds.routes.transactionsRoute} />;
}
