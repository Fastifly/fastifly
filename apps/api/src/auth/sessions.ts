import { createHash, randomBytes } from "node:crypto";

export const SESSION_TOKEN_BYTE_LENGTH = 32;
export const RECOVERY_CODE_BYTE_LENGTH = 15;
export const INVITATION_TOKEN_BYTE_LENGTH = 32;
export const DEFAULT_RECOVERY_CODE_COUNT = 10;

export function generateOpaqueToken(byteLength: number): string {
  return randomBytes(byteLength).toString("base64url");
}

export function hashOpaqueToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function generateSessionToken(): string {
  return generateOpaqueToken(SESSION_TOKEN_BYTE_LENGTH);
}

export function hashSessionToken(token: string): string {
  return hashOpaqueToken(token);
}

export function generateRecoveryCodes(count = DEFAULT_RECOVERY_CODE_COUNT): readonly string[] {
  return Array.from({ length: count }, () => generateOpaqueToken(RECOVERY_CODE_BYTE_LENGTH));
}

export function hashRecoveryCode(code: string): string {
  return hashOpaqueToken(code);
}

export function generateInvitationToken(): string {
  return generateOpaqueToken(INVITATION_TOKEN_BYTE_LENGTH);
}

export function hashInvitationToken(token: string): string {
  return hashOpaqueToken(token);
}
