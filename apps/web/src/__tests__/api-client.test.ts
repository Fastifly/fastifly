import { afterEach, describe, expect, it, vi } from "vitest";

const EMPTY_TRANSACTIONS_RESPONSE = {
  data: [],
  pageInfo: {
    hasNextPage: false,
    hasPreviousPage: false,
    nextCursor: null,
    previousCursor: null,
  },
};

describe("apiClient listTransactions", () => {
  const originalFetch = globalThis.fetch;
  const originalApiBaseUrl = process.env.VITE_FASTIFLY_API_BASE_URL;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalApiBaseUrl === undefined) {
      delete process.env.VITE_FASTIFLY_API_BASE_URL;
    } else {
      process.env.VITE_FASTIFLY_API_BASE_URL = originalApiBaseUrl;
    }
    vi.resetModules();
  });

  it("forwards categoryId in transactions query params", async () => {
    const fetchMock = vi.fn(async (_request: Request) => {
      return new Response(JSON.stringify(EMPTY_TRANSACTIONS_RESPONSE), {
        headers: {
          "content-type": "application/json",
        },
        status: 200,
      });
    });

    process.env.VITE_FASTIFLY_API_BASE_URL = "http://127.0.0.1:4000";
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const { apiClient } = await import("../api/client.js");
    await apiClient.listTransactions({
      accountId: "019e0000-0000-7000-a000-000000000301",
      categoryId: "019e0000-0000-7000-a000-000000000401",
      ledgerId: "019e0000-0000-7000-a000-000000000201",
      workspaceId: "019e0000-0000-7000-a000-000000000101",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const request = fetchMock.mock.calls[0]?.[0] as Request;
    const params = new URL(request.url).searchParams;

    expect(params.get("accountId")).toBe("019e0000-0000-7000-a000-000000000301");
    expect(params.get("categoryId")).toBe("019e0000-0000-7000-a000-000000000401");
  });
});
