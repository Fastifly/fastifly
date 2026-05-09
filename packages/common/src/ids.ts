import { z } from "zod";

export const SyncedIdSchema = z.uuidv7();
export type SyncedId = z.infer<typeof SyncedIdSchema>;

export type UuidV7RandomBytes = (byteLength: number) => Uint8Array;

export type CreateUuidV7Options = {
  readonly nowMs?: number;
  readonly randomBytes?: UuidV7RandomBytes;
};

const UUID_BYTE_LENGTH = 16;
const UUID_RANDOM_BYTE_LENGTH = 10;
const MAX_UUIDV7_TIMESTAMP_MS = 2 ** 48 - 1;

function defaultRandomBytes(byteLength: number): Uint8Array {
  const crypto = globalThis.crypto;
  if (!crypto?.getRandomValues) {
    throw new Error("crypto.getRandomValues is required to generate synced IDs");
  }

  return crypto.getRandomValues(new Uint8Array(byteLength));
}

function assertValidTimestamp(nowMs: number): number {
  if (!Number.isInteger(nowMs) || nowMs < 0 || nowMs > MAX_UUIDV7_TIMESTAMP_MS) {
    throw new RangeError("UUIDv7 timestamp must be an integer Unix millisecond value");
  }

  return nowMs;
}

function toHex(byte: number): string {
  return byte.toString(16).padStart(2, "0");
}

function stringifyUuid(bytes: Uint8Array): string {
  const hex = Array.from(bytes, toHex).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(
    16,
    20,
  )}-${hex.slice(20)}`;
}

export function createUuidV7(options: CreateUuidV7Options = {}): SyncedId {
  const nowMs = assertValidTimestamp(options.nowMs ?? Date.now());
  const randomBytes = options.randomBytes ?? defaultRandomBytes;
  const random = randomBytes(UUID_RANDOM_BYTE_LENGTH);

  if (random.length !== UUID_RANDOM_BYTE_LENGTH) {
    throw new RangeError("UUIDv7 random source must return exactly 10 bytes");
  }

  const bytes = new Uint8Array(UUID_BYTE_LENGTH);
  const timestamp = BigInt(nowMs);

  bytes[0] = Number((timestamp >> 40n) & 0xffn);
  bytes[1] = Number((timestamp >> 32n) & 0xffn);
  bytes[2] = Number((timestamp >> 24n) & 0xffn);
  bytes[3] = Number((timestamp >> 16n) & 0xffn);
  bytes[4] = Number((timestamp >> 8n) & 0xffn);
  bytes[5] = Number(timestamp & 0xffn);

  bytes.set(random, 6);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x70;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;

  return SyncedIdSchema.parse(stringifyUuid(bytes));
}

export function parseSyncedId(value: string): SyncedId {
  return SyncedIdSchema.parse(value);
}

export function isSyncedId(value: string): value is SyncedId {
  return SyncedIdSchema.safeParse(value).success;
}
