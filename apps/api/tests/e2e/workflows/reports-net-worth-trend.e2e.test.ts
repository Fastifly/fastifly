import { afterEach, describe, expect, it } from "vitest";
import {
  createAccount,
  createSqliteE2eSystem,
  createTransaction,
  registerAndResolveScope,
} from "../helpers/system.js";

describe("e2e/api/workflow/reports-net-worth-trend", () => {
  const cleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanups.length > 0) {
      const cleanup = cleanups.pop();
      if (cleanup) {
        await cleanup();
      }
    }
  });

  it("returns net worth trend with monthly up/down/flat deltas from backend aggregation", async () => {
    const { app, cleanup } = await createSqliteE2eSystem({ seedLevel: "none" });
    cleanups.push(cleanup);

    const owner = await registerAndResolveScope(app, {
      password: "password123",
      username: "owner-reports-e2e",
    });

    const bank = await createAccount(app, owner, {
      currencyCode: "INR",
      kind: "asset",
      name: "HDFC Checking",
      subtype: "bank",
    });
    const cash = await createAccount(app, owner, {
      currencyCode: "INR",
      kind: "asset",
      name: "Cash Wallet",
      subtype: "cash",
    });
    const groceries = await createAccount(app, owner, {
      currencyCode: "INR",
      kind: "expense",
      name: "Groceries",
      subtype: "external",
    });
    const salary = await createAccount(app, owner, {
      currencyCode: "INR",
      kind: "revenue",
      name: "Salary Source",
      subtype: "external",
    });

    await createTransaction(app, owner, {
      currencyCode: "INR",
      description: "January salary",
      occurredAt: "2026-01-20T09:00:00.000Z",
      sourceAccountId: salary,
      transactions: [{ amountMinor: "100000", destinationAccountId: bank }],
      type: "income",
    });
    await createTransaction(app, owner, {
      currencyCode: "INR",
      description: "February groceries",
      occurredAt: "2026-02-10T09:00:00.000Z",
      sourceAccountId: bank,
      transactions: [{ amountMinor: "15000", destinationAccountId: groceries }],
      type: "expense",
    });
    await createTransaction(app, owner, {
      currencyCode: "INR",
      description: "March salary",
      occurredAt: "2026-03-05T09:00:00.000Z",
      sourceAccountId: salary,
      transactions: [{ amountMinor: "50000", destinationAccountId: bank }],
      type: "income",
    });
    await createTransaction(app, owner, {
      currencyCode: "INR",
      description: "April cash transfer",
      occurredAt: "2026-04-12T09:00:00.000Z",
      sourceAccountId: bank,
      transactions: [{ amountMinor: "10000", destinationAccountId: cash }],
      type: "transfer",
    });
    await createTransaction(app, owner, {
      currencyCode: "INR",
      description: "May groceries",
      occurredAt: "2026-05-02T09:00:00.000Z",
      sourceAccountId: bank,
      transactions: [{ amountMinor: "7000", destinationAccountId: groceries }],
      type: "expense",
    });

    const response = await app.inject({
      headers: { cookie: owner.cookie },
      method: "GET",
      url: `/api/v1/workspaces/${owner.workspaceId}/ledgers/${owner.ledgerId}/reports/net-worth?months=4&asOfDate=2026-05-15`,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{
      data: {
        currencyCode: string;
        months: number;
        points: Array<{
          change: { amountMinor: string; currencyCode: string };
          direction: "up" | "down" | "flat";
          monthKey: string;
          monthStart: string;
          netWorth: { amountMinor: string; currencyCode: string };
        }>;
        range: { fromMonth: string; toMonth: string };
      };
    }>();

    expect(body.data.currencyCode).toBe("INR");
    expect(body.data.months).toBe(4);
    expect(body.data.range).toEqual({
      fromMonth: "2026-02-01",
      toMonth: "2026-05-01",
    });

    expect(body.data.points.map((point) => point.monthKey)).toEqual([
      "2026-02",
      "2026-03",
      "2026-04",
      "2026-05",
    ]);
    expect(body.data.points.map((point) => point.change.amountMinor)).toEqual([
      "-15000",
      "50000",
      "0",
      "-7000",
    ]);
    expect(body.data.points.map((point) => point.netWorth.amountMinor)).toEqual([
      "85000",
      "135000",
      "135000",
      "128000",
    ]);
    expect(body.data.points.map((point) => point.direction)).toEqual([
      "down",
      "up",
      "flat",
      "down",
    ]);
  });
});
