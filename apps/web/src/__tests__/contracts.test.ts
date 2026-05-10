import { describe, expect, it } from "vitest";

import { webPwaSafetySmoke, webSharedContractSmoke } from "../index.js";

describe("web shared contract smoke", () => {
  it("uses package contracts instead of local duplicate schemas", () => {
    expect(
      webSharedContractSmoke.authCredentialsSchema.parse({
        password: "correct horse battery staple",
        username: "priyanshu",
      }),
    ).toEqual({
      password: "correct horse battery staple",
      username: "priyanshu",
    });

    expect(
      webSharedContractSmoke.moneySchema.parse({
        amountMinor: "12550",
        currencyCode: "INR",
      }),
    ).toEqual({
      amountMinor: "12550",
      currencyCode: "INR",
    });

    expect(webSharedContractSmoke.paginationQuerySchema.parse({ limit: "25" })).toEqual({
      limit: 25,
    });
  });

  it("keeps financial API routes out of service worker cache scope", () => {
    expect(webPwaSafetySmoke.isSensitiveRequestPath("/api/v1/sync/push")).toBe(true);
    expect(webPwaSafetySmoke.isSensitiveRequestPath("/backup/export")).toBe(true);
    expect(webPwaSafetySmoke.isSensitiveRequestPath("/")).toBe(false);
    expect(
      webPwaSafetySmoke.shouldRegisterServiceWorker({
        hasServiceWorker: true,
        isProduction: false,
      }),
    ).toBe(false);
    expect(
      webPwaSafetySmoke.shouldRegisterServiceWorker({
        hasServiceWorker: true,
        isProduction: true,
      }),
    ).toBe(true);
  });

  it("treats malformed local outbox data as empty instead of showing stale counts", () => {
    expect(
      webPwaSafetySmoke.readPendingOutboxCount({
        getItem: () => "not-json",
      }),
    ).toBe(0);
  });
});
