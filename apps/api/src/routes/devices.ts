import {
  CreateDeviceRequestSchema,
  CreateDeviceResponseSchema,
  ListDevicesResponseSchema,
  parseSyncedId,
  RevokeDeviceResponseSchema,
} from "@fastifly/common";
import type { DeviceRecord, DeviceRepository } from "@fastifly/db";
import type { FastifyInstance } from "fastify";
import { z } from "zod/v4";

import { requireAuthenticatedUser } from "../policies.js";
import { ErrorResponseSchemas } from "../schemas.js";

const DeviceParamsSchema = z.strictObject({
  deviceId: z.uuidv7(),
});

export type RegisterDeviceRoutesOptions = {
  readonly deviceRepository?: DeviceRepository | undefined;
};

export async function registerDeviceRoutes(
  app: FastifyInstance,
  options: RegisterDeviceRoutesOptions,
): Promise<void> {
  if (!options.deviceRepository) {
    return;
  }
  const deviceRepository = options.deviceRepository;

  app.post(
    "/api/v1/devices",
    {
      onRequest: app.csrfProtection,
      schema: {
        body: CreateDeviceRequestSchema,
        response: {
          201: CreateDeviceResponseSchema,
          ...ErrorResponseSchemas,
        },
      },
    },
    async (request, reply) => {
      const userId = requireAuthenticatedUser(request);
      const body = CreateDeviceRequestSchema.parse(request.body);
      const device = await deviceRepository.registerDevice({
        deviceKey: body.deviceKey,
        name: body.name,
        userId,
      });

      return reply.status(201).send({ data: { device: toDeviceResponse(device) } });
    },
  );

  app.get(
    "/api/v1/devices",
    {
      schema: {
        response: {
          200: ListDevicesResponseSchema,
          ...ErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      const userId = requireAuthenticatedUser(request);
      const devices = await deviceRepository.listDevicesForUser(userId);

      return { data: devices.map(toDeviceResponse) };
    },
  );

  app.post(
    "/api/v1/devices/:deviceId/revoke",
    {
      onRequest: app.csrfProtection,
      schema: {
        params: DeviceParamsSchema,
        response: {
          200: RevokeDeviceResponseSchema,
          ...ErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      const userId = requireAuthenticatedUser(request);
      const params = DeviceParamsSchema.parse(request.params);
      const device = await deviceRepository.revokeDevice({
        deviceId: parseSyncedId(params.deviceId),
        userId,
      });
      if (!device) {
        throw makeHttpError(404, "Device was not found.");
      }

      return { data: { device: toDeviceResponse(device) } };
    },
  );
}

function toDeviceResponse(device: DeviceRecord) {
  return {
    createdAt: device.createdAt,
    deviceKey: device.deviceKey,
    id: device.id,
    lastSeenAt: device.lastSeenAt,
    name: device.name,
    revokedAt: device.revokedAt,
  };
}

function makeHttpError(statusCode: number, message: string): Error & { statusCode: number } {
  const error = new Error(message) as Error & { statusCode: number };
  error.statusCode = statusCode;
  return error;
}
