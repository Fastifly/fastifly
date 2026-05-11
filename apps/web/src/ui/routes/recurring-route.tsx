import { testIds } from "@/testing/testid-registry";
import { RouteMarker } from "./route-marker";

export function RecurringRouteComponent() {
  return <RouteMarker data-testid={testIds.routes.recurringRoute} />;
}
