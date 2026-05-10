import type { ApiErrorCode } from "@fastifly/common";

export const SESSION_EXPIRED_EVENT = "fastifly:session-expired";

type SessionExpiredInput = {
  readonly error: unknown;
  readonly hadAuthenticatedSession: boolean;
  readonly pathname: string;
};

export function notifySessionExpired(): void {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
}

export function getApiErrorCode(error: unknown): ApiErrorCode | null {
  if (
    typeof error !== "object" ||
    error === null ||
    !("response" in error) ||
    typeof error.response !== "object" ||
    error.response === null ||
    !("error" in error.response) ||
    typeof error.response.error !== "object" ||
    error.response.error === null ||
    !("code" in error.response.error) ||
    typeof error.response.error.code !== "string"
  ) {
    return null;
  }

  return error.response.error.code as ApiErrorCode;
}

export function isUnauthenticatedApiError(error: unknown): boolean {
  return getApiErrorCode(error) === "UNAUTHENTICATED";
}

export function shouldShowSessionExpiredDialog(input: SessionExpiredInput): boolean {
  return (
    input.pathname !== "/login" &&
    input.hadAuthenticatedSession &&
    isUnauthenticatedApiError(input.error)
  );
}
