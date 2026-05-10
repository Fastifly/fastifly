import { createUuidV7, type SyncedId } from "@fastifly/common";
import type {
  DeviceRecord,
  DeviceRepository,
  IdentityRepository,
  SessionRecord,
  UserRecord,
} from "@fastifly/db";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildApiApp } from "../app.js";
import { hashSessionToken } from "../auth/sessions.js";
import { injectWithCsrf } from "./helpers/csrf.js";

const apps: Awaited<ReturnType<typeof buildApiApp>>[] = [];
const SESSION_TOKEN = "device-route-session";

const user: UserRecord = {
  createdAt: "2026-05-09T00:00:00.000Z",
  disabledAt: null,
  displayName: "Owner",
  id: createUuidV7(),
  passwordHash: "$argon2id$fixture",
  updatedAt: "2026-05-09T00:00:00.000Z",
  username: "owner",
  usernameNormalized: "owner",
};

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("device routes", () => {
  it("registers, lists, and revokes the current user's devices", async () => {
    const deviceRepository = makeDeviceRepository();
    const app = await buildApiApp({
      config: { logLevel: "silent", nodeEnv: "test" },
      deviceRepository,
      identityRepository: makeIdentityRepository(),
      readiness: { migrations: "ok" },
    });
    apps.push(app);

    const created = await injectWithCsrf(app, {
      headers: { cookie: sessionCookie() },
      method: "POST",
      payload: { deviceKey: "browser-profile", name: "Laptop" },
      url: "/api/v1/devices",
    });
    expect(created.statusCode).toBe(201);
    const deviceId = created.json().data.device.id as SyncedId;

    const list = await app.inject({
      headers: { cookie: sessionCookie() },
      method: "GET",
      url: "/api/v1/devices",
    });
    expect(list.json().data).toHaveLength(1);

    const revoked = await injectWithCsrf(app, {
      headers: { cookie: sessionCookie() },
      method: "POST",
      url: `/api/v1/devices/${deviceId}/revoke`,
    });
    expect(revoked.statusCode).toBe(200);
    expect(revoked.json().data.device.revokedAt).toBe("2026-05-09T01:00:00.000Z");
  });
});

function makeIdentityRepository(): IdentityRepository {
  const session: SessionRecord = {
    createdAt: "2026-05-09T00:00:00.000Z",
    expiresAt: "2026-06-09T00:00:00.000Z",
    id: createUuidV7(),
    ipAddress: null,
    revokedAt: null,
    tokenHash: hashSessionToken(SESSION_TOKEN),
    userAgent: null,
    userId: user.id,
  };

  return {
    findActiveSessionByTokenHash: async (tokenHash: string) =>
      tokenHash === session.tokenHash ? session : null,
    findDefaultWorkspaceContextForUser: async () => null,
    findUserById: async (userId: SyncedId) => (userId === user.id ? user : null),
  } as unknown as IdentityRepository;
}

function makeDeviceRepository(): DeviceRepository {
  const devices = new Map<SyncedId, DeviceRecord>();

  return {
    async listDevicesForUser(userId) {
      return [...devices.values()].filter((device) => device.userId === userId);
    },
    async registerDevice(input) {
      const existing = [...devices.values()].find(
        (device) => device.userId === input.userId && device.deviceKey === input.deviceKey,
      );
      if (existing) {
        return existing;
      }
      const device: DeviceRecord = {
        createdAt: "2026-05-09T00:00:00.000Z",
        deviceKey: input.deviceKey,
        id: createUuidV7(),
        lastSeenAt: "2026-05-09T00:00:00.000Z",
        name: input.name,
        revokedAt: null,
        userId: input.userId,
      };
      devices.set(device.id, device);
      return device;
    },
    async revokeDevice(input) {
      const device = devices.get(input.deviceId);
      if (!device || device.userId !== input.userId) {
        return null;
      }
      const revoked = { ...device, revokedAt: "2026-05-09T01:00:00.000Z" };
      devices.set(device.id, revoked);
      return revoked;
    },
  };
}

function sessionCookie(): string {
  return `fastifly_session=${SESSION_TOKEN}`;
}
