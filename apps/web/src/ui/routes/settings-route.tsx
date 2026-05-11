import { testIds } from "@/testing/testid-registry";
import { RouteMarker } from "./route-marker";

export function SettingsRouteComponent() {
  return <RouteMarker data-testid={testIds.routes.settingsRoute} />;
}
