import { z } from "zod";

export const IsoDateSchema = z.iso.date();
export const IsoDateTimeSchema = z.iso.datetime({ offset: true });
export const NullableIsoDateTimeSchema = IsoDateTimeSchema.nullable();
