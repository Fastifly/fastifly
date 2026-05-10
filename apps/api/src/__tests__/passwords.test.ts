import { createSeedPasswordHash, SEED_CREDENTIALS } from "@fastifly/db";
import { describe, expect, it } from "vitest";

import {
  hashPassword,
  PASSWORD_HASHING_OPTIONS,
  PasswordPolicyError,
  verifyPasswordHash,
} from "../auth/passwords.js";

describe("password hashing", () => {
  it("uses the documented Argon2id baseline", () => {
    expect(PASSWORD_HASHING_OPTIONS).toMatchObject({
      algorithm: 2,
      memoryCost: 19 * 1024,
      parallelism: 1,
      timeCost: 2,
    });
  });

  it("hashes and verifies passwords without storing plaintext", async () => {
    const passwordHash = await hashPassword("correct horse battery staple");

    expect(passwordHash).toMatch(/^\$argon2id\$/);
    expect(passwordHash).not.toContain("correct horse battery staple");
    await expect(
      verifyPasswordHash({ password: "correct horse battery staple", passwordHash }),
    ).resolves.toBe(true);
    await expect(verifyPasswordHash({ password: "wrong password", passwordHash })).resolves.toBe(
      false,
    );
  });

  it("keeps seeded demo credentials compatible with API password verification", async () => {
    const ownerPasswordHash = await createSeedPasswordHash(SEED_CREDENTIALS.owner.password);
    const partnerPasswordHash = await createSeedPasswordHash(SEED_CREDENTIALS.partner.password);

    await expect(
      verifyPasswordHash({
        password: SEED_CREDENTIALS.owner.password,
        passwordHash: ownerPasswordHash,
      }),
    ).resolves.toBe(true);
    await expect(
      verifyPasswordHash({
        password: SEED_CREDENTIALS.partner.password,
        passwordHash: partnerPasswordHash,
      }),
    ).resolves.toBe(true);
  });

  it("fails closed for unsupported hash formats and weak passwords", async () => {
    await expect(
      verifyPasswordHash({
        password: "correct horse battery staple",
        passwordHash: "not-an-argon2-hash",
      }),
    ).resolves.toBe(false);

    await expect(hashPassword("short")).rejects.toThrow(PasswordPolicyError);
  });
});
