import { DEMO_LOGIN_CREDENTIALS, PASSWORD_HASHING_OPTIONS } from "@fastifly/common";
import { hash } from "@node-rs/argon2";

export const SEED_CREDENTIALS = DEMO_LOGIN_CREDENTIALS;

export const SEED_NOW = "2026-05-10T00:00:00.000Z";

export async function createSeedPasswordHash(password: string): Promise<string> {
  return hash(password, PASSWORD_HASHING_OPTIONS);
}
