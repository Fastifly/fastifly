import {
  IDEMPOTENCY_KEY_HEADER,
  IDEMPOTENCY_REPLAYED_HEADER,
  parseOptionalIdempotencyKey,
} from "@fastifly/common";
import type { LedgerMutationRunResult } from "@fastifly/db";
import type { FastifyReply, FastifyRequest } from "fastify";

export function getRequestIdempotencyKey(request: FastifyRequest): string | null {
  try {
    return parseOptionalIdempotencyKey(request.headers[IDEMPOTENCY_KEY_HEADER]);
  } catch {
    const error = new Error("Idempotency key is invalid.") as Error & { statusCode: number };
    error.statusCode = 400;
    throw error;
  }
}

export function sendLedgerMutationResult(
  reply: FastifyReply,
  result: LedgerMutationRunResult,
): FastifyReply {
  if (result.idempotencyReplayed) {
    reply.header(IDEMPOTENCY_REPLAYED_HEADER, "true");
  }

  return reply.status(result.status).send(result.body);
}
