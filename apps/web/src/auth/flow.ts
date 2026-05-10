export type AuthSessionState = "authenticated" | "pending" | "unauthenticated";

export type AuthRedirectInput = {
  readonly pathname: string;
  readonly sessionState: AuthSessionState;
};

export function getAuthRedirect(input: AuthRedirectInput): "/" | "/login" | null {
  const isLoginRoute = input.pathname === "/login";

  if (isLoginRoute && input.sessionState === "authenticated") {
    return "/";
  }

  if (!isLoginRoute && input.sessionState === "unauthenticated") {
    return "/login";
  }

  return null;
}
