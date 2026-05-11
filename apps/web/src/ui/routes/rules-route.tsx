import { testIds } from "@/testing/testid-registry";
import { RouteMarker } from "./route-marker";

export function RulesRouteComponent() {
  return <RouteMarker data-testid={testIds.routes.rulesRoute} />;
}
