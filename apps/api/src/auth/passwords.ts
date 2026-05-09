import { type Options as Argon2Options, hash, verify } from "@node-rs/argon2";

export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 1024;
export const ARGON2ID_ALGORITHM = 2;

export const PASSWORD_HASHING_OPTIONS = {
  algorithm: ARGON2ID_ALGORITHM,
  memoryCost: 19 * 1024,
  parallelism: 1,
  timeCost: 2,
} as const satisfies Argon2Options;

export class PasswordPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PasswordPolicyError";
  }
}

export function assertPasswordMeetsPolicy(password: string): void {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new PasswordPolicyError("Password must be at least 12 characters long.");
  }

  if (password.length > MAX_PASSWORD_LENGTH) {
    throw new PasswordPolicyError("Password is too long.");
  }
}

export async function hashPassword(password: string): Promise<string> {
  assertPasswordMeetsPolicy(password);
  return hash(password, PASSWORD_HASHING_OPTIONS);
}

export async function verifyPasswordHash(input: {
  readonly passwordHash: string;
  readonly password: string;
}): Promise<boolean> {
  if (!input.passwordHash.startsWith("$argon2id$")) {
    return false;
  }

  return verify(input.passwordHash, input.password);
}
