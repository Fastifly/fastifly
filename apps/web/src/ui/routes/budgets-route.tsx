import { testIds } from "@/testing/testid-registry";
import { RouteMarker } from "./route-marker";

export function BudgetsRouteComponent() {
  return <RouteMarker data-testid={testIds.routes.budgetsRoute} />;
}
