import { testIds } from "@/testing/testid-registry";
import { RouteMarker } from "./route-marker";

export function ReportsRouteComponent() {
  return <RouteMarker data-testid={testIds.routes.reportsRoute} />;
}
