import type { LedgerScope } from "@fastifly/common";
import { and, eq, isNull } from "drizzle-orm";

import type { PostgresDatabase } from "../postgres/client.js";
import { pgCurrencies, pgLedgers } from "../postgres/schema.js";
import type { SqliteClient } from "../sqlite/client.js";
import { assertLedgerScope } from "./base.js";

const DEFAULT_DECIMAL_PLACES = 2;

export type ImportTargetCurrency = {
  readonly code: string;
  readonly decimalPlaces: number;
};

export type LedgerCurrencyReader = {
  readonly resolveImportTargetCurrency: (scope: LedgerScope) => Promise<ImportTargetCurrency>;
};

export class LedgerCurrencyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LedgerCurrencyError";
  }
}

export function createSqliteLedgerCurrencyReader(client: SqliteClient): LedgerCurrencyReader {
  return {
    async resolveImportTargetCurrency(input) {
      const scope = assertLedgerScope(input);
      const ledgerRow = client
        .prepare<unknown[], { readonly base_currency_code: string }>(
          `
            SELECT base_currency_code
            FROM ledgers
            WHERE id = ?
              AND workspace_id = ?
              AND archived_at IS NULL
            LIMIT 1
          `,
        )
        .get(scope.ledgerId, scope.workspaceId);
      if (!ledgerRow) {
        throw new LedgerCurrencyError("Ledger scope was not found.");
      }

      const currencyRow = client
        .prepare<unknown[], { readonly decimal_places: number }>(
          "SELECT decimal_places FROM currencies WHERE code = ? LIMIT 1",
        )
        .get(ledgerRow.base_currency_code);

      return {
        code: ledgerRow.base_currency_code,
        decimalPlaces: normalizeDecimalPlaces(currencyRow?.decimal_places),
      };
    },
  };
}

export function createPostgresLedgerCurrencyReader(db: PostgresDatabase): LedgerCurrencyReader {
  return {
    async resolveImportTargetCurrency(input) {
      const scope = assertLedgerScope(input);
      const ledgerRows = await db
        .select({ baseCurrencyCode: pgLedgers.baseCurrencyCode })
        .from(pgLedgers)
        .where(
          and(
            eq(pgLedgers.id, scope.ledgerId),
            eq(pgLedgers.workspaceId, scope.workspaceId),
            isNull(pgLedgers.archivedAt),
          ),
        )
        .limit(1);
      const ledger = ledgerRows[0];
      if (!ledger) {
        throw new LedgerCurrencyError("Ledger scope was not found.");
      }

      const currencyRows = await db
        .select({ decimalPlaces: pgCurrencies.decimalPlaces })
        .from(pgCurrencies)
        .where(eq(pgCurrencies.code, ledger.baseCurrencyCode))
        .limit(1);

      return {
        code: ledger.baseCurrencyCode,
        decimalPlaces: normalizeDecimalPlaces(currencyRows[0]?.decimalPlaces),
      };
    },
  };
}

function normalizeDecimalPlaces(value: number | null | undefined): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 8
    ? value
    : DEFAULT_DECIMAL_PLACES;
}
