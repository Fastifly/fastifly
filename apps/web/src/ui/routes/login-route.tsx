import { testIds } from "@/testing/testid-registry";
import { AuthPage } from "../auth-page";

export function LoginRouteComponent() {
  return (
    <>
      <AuthPage />
      <div className="sr-only" data-testid={testIds.routes.loginRoute} />
    </>
  );
}
