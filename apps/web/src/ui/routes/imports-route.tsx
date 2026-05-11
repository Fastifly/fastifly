import { testIds } from "@/testing/testid-registry";
import { RouteMarker } from "./route-marker";

export function ImportsRouteComponent() {
  return <RouteMarker data-testid={testIds.routes.importsRoute} />;
}
