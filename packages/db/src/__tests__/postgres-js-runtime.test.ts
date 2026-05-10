import { fileURLToPath } from "node:url";

import { createUuidV7, type SyncedId } from "@fastifly/common";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { describe, expect, it } from "vitest";

import {
  closePostgresClient,
  createPostgresAccountRepository,
  createPostgresClient,
  createPostgresDatabaseFromClient,
  createPostgresIdentityRepository,
  createPostgresTransactionQueryService,
  createPostgresTransactionWriteRepository,
} from "../index.js";

const databaseUrl =
  process.env.FASTIFLY_TEST_POSTGRES_URL ?? process.env.TEST_POSTGRES_DATABASE_URL;
const migrationsFolder = fileURLToPath(new URL("../postgres/migrations", import.meta.url));
const describeWithPostgres = databaseUrl ? describe : describe.skip;

describeWithPostgres("postgres.js production runtime", () => {
  it("applies Drizzle migrations and runs repositories through postgres.js", async () => {
    const client = createPostgresClient({
      applicationName: "fastifly-test",
      connectTimeoutSeconds: 5,
      idleTimeoutSeconds: 1,
      maxConnections: 1,
      statementTimeoutMs: 5_000,
      url: databaseUrl as string,
    });

    try {
      await client.unsafe("DROP SCHEMA IF EXISTS drizzle CASCADE");
      await client.unsafe("DROP SCHEMA IF EXISTS public CASCADE");
      await client.unsafe("CREATE SCHEMA public");

      const db = createPostgresDatabaseFromClient(client);
      await migrate(db, { migrationsFolder });
      await seedInrCurrency(client);

      const identityRepository = createPostgresIdentityRepository(db, {
        clock: { now: () => new Date("2026-05-09T00:00:00.000Z") },
        createId: createDeterministicIdGenerator(),
      });

      const user = await identityRepository.createUser({
        displayName: "Production Runtime",
        passwordHash: "hash",
        username: "Production.User",
      });

      const found = await identityRepository.findUserByNormalizedUsername("production.user");

      expect(found).toMatchObject({
        id: user.id,
        username: "Production.User",
        usernameNormalized: "production.user",
      });

      const workspaceState = await identityRepository.bootstrapDefaultWorkspace({
        baseCurrencyCode: "INR",
        firstDayOfWeek: 1,
        ledgerName: "Primary",
        userId: user.id,
        workspaceName: "Personal",
      });

      const accountRepository = createPostgresAccountRepository(db, {
        clock: { now: () => new Date("2026-05-09T00:00:00.000Z") },
        createId: createDeterministicIdGenerator(),
      });

      const bank = await accountRepository.createAccount({
        currencyCode: "INR",
        kind: "asset",
        ledgerId: workspaceState.ledger.id,
        name: "Bank",
        subtype: "bank",
        workspaceId: workspaceState.workspace.id,
      });

      const groceries = await accountRepository.createAccount({
        currencyCode: "INR",
        kind: "expense",
        ledgerId: workspaceState.ledger.id,
        name: "Groceries",
        subtype: "external",
        workspaceId: workspaceState.workspace.id,
      });

      const transactionRepository = createPostgresTransactionWriteRepository(db, {
        clock: { now: () => new Date("2026-05-09T00:00:00.000Z") },
        createId: createDeterministicIdGenerator(),
      });
      const transactionQueryService = createPostgresTransactionQueryService(db);

      const transaction = await transactionRepository.createTransaction({
        currencyCode: "INR",
        description: "Groceries",
        ledgerId: workspaceState.ledger.id,
        lines: [
          {
            amountMinor: 12_000n,
            destinationAccountId: groceries.account.id,
          },
        ],
        occurredAt: "2026-05-09T09:00:00.000Z",
        sourceAccountId: bank.account.id,
        type: "expense",
        workspaceId: workspaceState.workspace.id,
      });

      expect(transaction.journals).toHaveLength(1);
      expect(transaction.journals[0]?.postings.map((posting) => posting.amountMinor)).toEqual([
        -12_000n,
        12_000n,
      ]);

      const transactionPage = await transactionQueryService.listTransactionGroups({
        ledgerId: workspaceState.ledger.id,
        workspaceId: workspaceState.workspace.id,
      });

      expect(transactionPage.items).toHaveLength(1);
      expect(transactionPage.items[0]).toMatchObject({
        id: transaction.id,
        type: "expense",
      });

      await expect(
        accountRepository.getAccountBalance({
          accountId: bank.account.id,
          ledgerId: workspaceState.ledger.id,
          workspaceId: workspaceState.workspace.id,
        }),
      ).resolves.toMatchObject({
        balanceMinor: -12_000n,
        reportingBalanceMinor: -12_000n,
      });
    } finally {
      await closePostgresClient(client);
    }
  });
});

async function seedInrCurrency(client: { readonly unsafe: (query: string) => Promise<unknown> }) {
  await client.unsafe(`
    INSERT INTO currencies (
      code,
      name,
      decimal_places,
      symbol,
      created_at,
      updated_at
    )
    VALUES (
      'INR',
      'Indian Rupee',
      2,
      'Rs',
      '2026-05-09T00:00:00.000Z',
      '2026-05-09T00:00:00.000Z'
    )
    ON CONFLICT(code) DO NOTHING
  `);
}

function createDeterministicIdGenerator(): () => SyncedId {
  let counter = 1;

  return () => {
    const value = counter;
    counter += 1;

    return createUuidV7({
      nowMs: Date.UTC(2026, 4, 9),
      randomBytes: (byteLength) => {
        const bytes = new Uint8Array(byteLength);
        bytes[byteLength - 1] = value;
        return bytes;
      },
    });
  };
}
