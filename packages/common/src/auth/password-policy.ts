export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 1024;
export const ARGON2ID_ALGORITHM = 2;

export const PASSWORD_HASHING_OPTIONS = {
  algorithm: ARGON2ID_ALGORITHM,
  memoryCost: 19 * 1024,
  parallelism: 1,
  timeCost: 2,
} as const;
