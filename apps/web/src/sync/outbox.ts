import { SyncOperationEnvelopeSchema } from "@fastifly/common";

export const OUTBOX_STORAGE_KEY = "fastifly.outbox.v1";

const OutboxStorageSchema = SyncOperationEnvelopeSchema.array();

export function readPendingOutboxCount(storage: Pick<Storage, "getItem">): number {
  const raw = storage.getItem(OUTBOX_STORAGE_KEY);

  if (!raw) {
    return 0;
  }

  const parsedJson = safeParseJson(raw);
  const parsedOutbox = OutboxStorageSchema.safeParse(parsedJson);

  if (!parsedOutbox.success) {
    return 0;
  }

  return parsedOutbox.data.length;
}

function safeParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
