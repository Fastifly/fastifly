import { describe, expect, it } from "vitest";

import { createUuidV7, isSyncedId, parseSyncedId } from "../ids.js";

const zeroRandom = (byteLength: number) => new Uint8Array(byteLength);

describe("synced ID contracts", () => {
  it("generates UUIDv7-compatible text IDs", () => {
    const id = createUuidV7({ nowMs: 0, randomBytes: zeroRandom });

    expect(id).toBe("00000000-0000-7000-8000-000000000000");
    expect(isSyncedId(id)).toBe(true);
    expect(parseSyncedId(id)).toBe(id);
  });

  it("keeps timestamp ordering when random bytes are equal", () => {
    const earlier = createUuidV7({ nowMs: 1, randomBytes: zeroRandom });
    const later = createUuidV7({ nowMs: 2, randomBytes: zeroRandom });

    expect(earlier < later).toBe(true);
  });

  it("rejects invalid timestamps and random sources", () => {
    expect(() => createUuidV7({ nowMs: -1, randomBytes: zeroRandom })).toThrow();
    expect(() => createUuidV7({ nowMs: 1.5, randomBytes: zeroRandom })).toThrow();
    expect(() =>
      createUuidV7({
        nowMs: 0,
        randomBytes: () => new Uint8Array(9),
      }),
    ).toThrow();
  });
});
