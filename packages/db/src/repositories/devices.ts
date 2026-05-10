import type { SyncedId } from "@fastifly/common";
import { and, eq } from "drizzle-orm";

import type { PostgresDatabase } from "../postgres/client.js";
import { pgDevices } from "../postgres/schema.js";
import type { SqliteClient } from "../sqlite/client.js";
import type { RepositoryClock } from "./base.js";
import { makeTimestamp, systemClock } from "./base.js";
import type { RepositoryIdGenerator } from "./identity.js";

export type DeviceRecord = {
  readonly id: SyncedId;
  readonly userId: SyncedId;
  readonly deviceKey: string;
  readonly name: string;
  readonly createdAt: string;
  readonly lastSeenAt: string | null;
  readonly revokedAt: string | null;
};

export type RegisterDeviceInput = {
  readonly userId: SyncedId;
  readonly deviceKey: string;
  readonly name: string;
};

export type RevokeDeviceInput = {
  readonly userId: SyncedId;
  readonly deviceId: SyncedId;
};

export type DeviceRepositoryOptions = {
  readonly clock?: RepositoryClock;
  readonly createId: RepositoryIdGenerator;
};

export type DeviceRepository = {
  readonly registerDevice: (input: RegisterDeviceInput) => Promise<DeviceRecord>;
  readonly listDevicesForUser: (userId: SyncedId) => Promise<readonly DeviceRecord[]>;
  readonly revokeDevice: (input: RevokeDeviceInput) => Promise<DeviceRecord | null>;
};

export function createSqliteDeviceRepository(
  client: SqliteClient,
  options: DeviceRepositoryOptions,
): DeviceRepository {
  const clock = options.clock ?? systemClock;

  return {
    async registerDevice(input) {
      const existing = readSqliteDeviceByKey(client, input.userId, input.deviceKey);
      if (existing) {
        client
          .prepare("UPDATE devices SET name = ?, last_seen_at = ? WHERE id = ?")
          .run(input.name, makeTimestamp(clock), existing.id);
        return readRequiredSqliteDevice(client, existing.id);
      }

      const now = makeTimestamp(clock);
      const id = options.createId();
      client
        .prepare(
          `
          INSERT INTO devices (id, user_id, device_key, name, created_at, last_seen_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `,
        )
        .run(id, input.userId, input.deviceKey, input.name, now, now);

      return readRequiredSqliteDevice(client, id);
    },

    async listDevicesForUser(userId) {
      const rows = client
        .prepare(
          `
          SELECT id, user_id, device_key, name, created_at, last_seen_at, revoked_at
          FROM devices
          WHERE user_id = ?
          ORDER BY created_at ASC, id ASC
        `,
        )
        .all(userId) as SqliteDeviceRow[];

      return rows.map(toDeviceRecord);
    },

    async revokeDevice(input) {
      const now = makeTimestamp(clock);
      client
        .prepare(
          `
          UPDATE devices
          SET revoked_at = COALESCE(revoked_at, ?)
          WHERE id = ? AND user_id = ?
        `,
        )
        .run(now, input.deviceId, input.userId);

      return readSqliteDeviceById(client, input.deviceId, input.userId);
    },
  };
}

export function createPostgresDeviceRepository(
  db: PostgresDatabase,
  options: DeviceRepositoryOptions,
): DeviceRepository {
  const clock = options.clock ?? systemClock;

  return {
    async registerDevice(input) {
      const now = clock.now();
      const existing = await readPostgresDeviceByKey(db, input.userId, input.deviceKey);
      if (existing) {
        const rows = await db
          .update(pgDevices)
          .set({ lastSeenAt: now, name: input.name })
          .where(eq(pgDevices.id, existing.id))
          .returning();
        return toDeviceRecord(rows[0] ?? existing);
      }

      const rows = await db
        .insert(pgDevices)
        .values({
          createdAt: now,
          deviceKey: input.deviceKey,
          id: options.createId(),
          lastSeenAt: now,
          name: input.name,
          userId: input.userId,
        })
        .returning();
      const device = rows[0];
      if (!device) {
        throw new Error("Failed to register device.");
      }

      return toDeviceRecord(device);
    },

    async listDevicesForUser(userId) {
      const rows = await db
        .select()
        .from(pgDevices)
        .where(eq(pgDevices.userId, userId))
        .orderBy(pgDevices.createdAt, pgDevices.id);

      return rows.map(toDeviceRecord);
    },

    async revokeDevice(input) {
      const rows = await db
        .update(pgDevices)
        .set({ revokedAt: clock.now() })
        .where(and(eq(pgDevices.id, input.deviceId), eq(pgDevices.userId, input.userId)))
        .returning();

      return rows[0] ? toDeviceRecord(rows[0]) : null;
    },
  };
}

type SqliteDeviceRow = {
  readonly id: string;
  readonly user_id: string;
  readonly device_key: string;
  readonly name: string;
  readonly created_at: string;
  readonly last_seen_at: string | null;
  readonly revoked_at: string | null;
};

function readSqliteDeviceByKey(
  client: SqliteClient,
  userId: SyncedId,
  deviceKey: string,
): DeviceRecord | null {
  const row = client
    .prepare(
      `
      SELECT id, user_id, device_key, name, created_at, last_seen_at, revoked_at
      FROM devices
      WHERE user_id = ? AND device_key = ?
      LIMIT 1
    `,
    )
    .get(userId, deviceKey) as SqliteDeviceRow | undefined;

  return row ? toDeviceRecord(row) : null;
}

function readSqliteDeviceById(
  client: SqliteClient,
  deviceId: SyncedId,
  userId: SyncedId,
): DeviceRecord | null {
  const row = client
    .prepare(
      `
      SELECT id, user_id, device_key, name, created_at, last_seen_at, revoked_at
      FROM devices
      WHERE id = ? AND user_id = ?
      LIMIT 1
    `,
    )
    .get(deviceId, userId) as SqliteDeviceRow | undefined;

  return row ? toDeviceRecord(row) : null;
}

function readRequiredSqliteDevice(client: SqliteClient, deviceId: SyncedId): DeviceRecord {
  const row = client
    .prepare(
      `
      SELECT id, user_id, device_key, name, created_at, last_seen_at, revoked_at
      FROM devices
      WHERE id = ?
      LIMIT 1
    `,
    )
    .get(deviceId) as SqliteDeviceRow | undefined;

  if (!row) {
    throw new Error("Device was not found after write.");
  }

  return toDeviceRecord(row);
}

async function readPostgresDeviceByKey(
  db: PostgresDatabase,
  userId: SyncedId,
  deviceKey: string,
): Promise<DeviceRecord | null> {
  const rows = await db
    .select()
    .from(pgDevices)
    .where(and(eq(pgDevices.userId, userId), eq(pgDevices.deviceKey, deviceKey)))
    .limit(1);

  return rows[0] ? toDeviceRecord(rows[0]) : null;
}

function toDeviceRecord(input: {
  readonly id: string;
  readonly userId?: string;
  readonly user_id?: string;
  readonly deviceKey?: string;
  readonly device_key?: string;
  readonly name: string;
  readonly createdAt?: Date | string;
  readonly created_at?: string;
  readonly lastSeenAt?: Date | string | null;
  readonly last_seen_at?: string | null;
  readonly revokedAt?: Date | string | null;
  readonly revoked_at?: string | null;
}): DeviceRecord {
  return {
    createdAt: toIsoString(input.createdAt ?? input.created_at),
    deviceKey: input.deviceKey ?? input.device_key ?? "",
    id: input.id as SyncedId,
    lastSeenAt: toNullableIsoString(input.lastSeenAt ?? input.last_seen_at ?? null),
    name: input.name,
    revokedAt: toNullableIsoString(input.revokedAt ?? input.revoked_at ?? null),
    userId: (input.userId ?? input.user_id ?? "") as SyncedId,
  };
}

function toIsoString(input: Date | string | undefined): string {
  if (input instanceof Date) {
    return input.toISOString();
  }

  return input ?? "";
}

function toNullableIsoString(input: Date | string | null): string | null {
  if (input instanceof Date) {
    return input.toISOString();
  }

  return input;
}
