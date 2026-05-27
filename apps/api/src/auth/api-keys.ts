import { generateOpaqueToken, hashOpaqueToken } from "./sessions.js";

export const API_KEY_BYTE_LENGTH = 32;
export const API_KEY_PREFIX = "ffk_";
// Number of leading characters of the plaintext key retained for display so
// users can recognize a key in the dashboard without exposing the secret.
export const API_KEY_DISPLAY_PREFIX_LENGTH = 12;

export function generateApiKeyToken(): string {
  return `${API_KEY_PREFIX}${generateOpaqueToken(API_KEY_BYTE_LENGTH)}`;
}

export function hashApiKeyToken(token: string): string {
  return hashOpaqueToken(token);
}

export function apiKeyDisplayPrefix(token: string): string {
  return token.slice(0, API_KEY_DISPLAY_PREFIX_LENGTH);
}

/**
 * Extracts a Fastifly API key from an `Authorization` header. Accepts either a
 * bare key or the conventional `Bearer <key>` scheme, and only returns values
 * that look like Fastifly keys so session-only requests are never misread.
 */
export function parseApiKeyFromAuthorizationHeader(header: string | undefined): string | null {
  if (!header) {
    return null;
  }

  const trimmed = header.trim();
  const bearerMatch = /^Bearer\s+(.+)$/i.exec(trimmed);
  const candidate = (bearerMatch?.[1] ?? trimmed).trim();

  return candidate.startsWith(API_KEY_PREFIX) ? candidate : null;
}
