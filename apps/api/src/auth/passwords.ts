import {
  ARGON2ID_ALGORITHM,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  PASSWORD_HASHING_OPTIONS,
} from "@fastifly/common";
import { type Options as Argon2Options, hash, verify } from "@node-rs/argon2";

export { ARGON2ID_ALGORITHM, MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, PASSWORD_HASHING_OPTIONS };

const passwordHashingOptions: Argon2Options = PASSWORD_HASHING_OPTIONS;

export class PasswordPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PasswordPolicyError";
  }
}

export function assertPasswordMeetsPolicy(password: string): void {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new PasswordPolicyError("Password must be at least 8 characters long.");
  }

  if (password.length > MAX_PASSWORD_LENGTH) {
    throw new PasswordPolicyError("Password is too long.");
  }
}

export async function hashPassword(password: string): Promise<string> {
  assertPasswordMeetsPolicy(password);
  return hash(password, passwordHashingOptions);
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
