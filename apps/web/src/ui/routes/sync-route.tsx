import { testIds } from "@/testing/testid-registry";
import { RouteMarker } from "./route-marker";

export function SyncRouteComponent() {
  return <RouteMarker data-testid={testIds.routes.syncRoute} />;
}
