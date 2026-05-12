import { testIds } from "@/testing/testid-registry";
import { RouteMarker } from "./route-marker";

export function CategoriesRouteComponent() {
  return <RouteMarker data-testid={testIds.routes.categoriesRoute} />;
}
