import { testIds } from "@/testing/testid-registry";
import { RouteMarker } from "./route-marker";

export function ProfileRouteComponent() {
  return <RouteMarker data-testid={testIds.routes.profileRoute} />;
}
