import { z } from "zod";

import { SyncedIdSchema } from "../ids.js";
import { IsoDateTimeSchema, NullableIsoDateTimeSchema } from "../schemas/scalars.js";

export const DeviceResponseSchema = z.strictObject({
  id: SyncedIdSchema,
  deviceKey: z.string().min(1),
  name: z.string().min(1),
  createdAt: IsoDateTimeSchema,
  lastSeenAt: NullableIsoDateTimeSchema,
  revokedAt: NullableIsoDateTimeSchema,
});

export const CreateDeviceRequestSchema = z.strictObject({
  deviceKey: z.string().trim().min(1).max(255),
  name: z.string().trim().min(1).max(120),
});

export const CreateDeviceResponseSchema = z.strictObject({
  data: z.strictObject({
    device: DeviceResponseSchema,
  }),
});

export const ListDevicesResponseSchema = z.strictObject({
  data: z.array(DeviceResponseSchema),
});

export const RevokeDeviceResponseSchema = z.strictObject({
  data: z.strictObject({
    device: DeviceResponseSchema,
  }),
});

export type CreateDeviceRequest = z.infer<typeof CreateDeviceRequestSchema>;
export type DeviceResponse = z.infer<typeof DeviceResponseSchema>;
