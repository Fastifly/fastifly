import { describe, expect, it } from "vitest";

import { FastiflyApiError } from "../api/client.js";
import {
  webAuthFlowSmoke,
  webNavigationSmoke,
  webPwaSafetySmoke,
  webSharedContractSmoke,
} from "../index.js";

describe("web shared contract smoke", () => {
  it("uses package contracts instead of local duplicate schemas", () => {
    expect(
      webSharedContractSmoke.registerCredentialsSchema.parse({
        password: "register-password",
        username: webSharedContractSmoke.defaultDemoLogin.username,
      }),
    ).toEqual({
      password: "register-password",
      username: webSharedContractSmoke.defaultDemoLogin.username,
    });
    expect(
      webSharedContractSmoke.loginCredentialsSchema.parse({
        password: "x",
        username: webSharedContractSmoke.defaultDemoLogin.username,
      }),
    ).toEqual({
      password: "x",
      username: webSharedContractSmoke.defaultDemoLogin.username,
    });
    expect(() =>
      webSharedContractSmoke.registerCredentialsSchema.parse({
        password: "short",
        username: webSharedContractSmoke.defaultDemoLogin.username,
      }),
    ).toThrow();

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

  it("keeps phone navigation curated and resolves nested active routes", () => {
    expect(webNavigationSmoke.getMobilePrimaryNavigation()).toHaveLength(
      webNavigationSmoke.maxMobileTabs,
    );
    expect(webNavigationSmoke.getMobilePrimaryNavigation().map((item) => item.slug)).toEqual([
      "dashboard",
      "transactions",
      "accounts",
      "budgets",
    ]);
    expect(webNavigationSmoke.getMobilePrimaryNavigation().map((item) => item.mobileLabel)).toEqual(
      ["Home", "Txns", "Accts", "Budget"],
    );
    expect(webNavigationSmoke.getCurrentNavigationItem("/transactions/new").slug).toBe(
      "transactions",
    );
  });

  it("keeps auth redirects explicit for protected and login routes", () => {
    expect(
      webAuthFlowSmoke.getAuthRedirect({
        pathname: "/transactions",
        sessionState: "unauthenticated",
      }),
    ).toBe("/login");
    expect(
      webAuthFlowSmoke.getAuthRedirect({
        pathname: "/login",
        sessionState: "authenticated",
      }),
    ).toBe("/");
    expect(
      webAuthFlowSmoke.getAuthRedirect({
        pathname: "/login",
        sessionState: "unauthenticated",
      }),
    ).toBeNull();
    expect(
      webAuthFlowSmoke.getAuthRedirect({
        pathname: "/accounts",
        sessionState: "pending",
      }),
    ).toBeNull();
  });

  it("shows re-auth dialog only for expired known sessions", () => {
    const unauthenticatedError = new FastiflyApiError({
      error: {
        code: "UNAUTHENTICATED",
        details: {},
        message: "Session expired.",
        requestId: "req_test",
      },
    });

    expect(
      webAuthFlowSmoke.shouldShowSessionExpiredDialog({
        error: unauthenticatedError,
        hadAuthenticatedSession: true,
        pathname: "/transactions",
      }),
    ).toBe(true);
    expect(
      webAuthFlowSmoke.shouldShowSessionExpiredDialog({
        error: unauthenticatedError,
        hadAuthenticatedSession: false,
        pathname: "/transactions",
      }),
    ).toBe(false);
    expect(
      webAuthFlowSmoke.shouldShowSessionExpiredDialog({
        error: unauthenticatedError,
        hadAuthenticatedSession: true,
        pathname: "/login",
      }),
    ).toBe(false);
  });
});
