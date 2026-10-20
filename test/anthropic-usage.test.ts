/**
 * `agentmoney usage` against a local stand-in for the Anthropic Usage API: the request it sends (path, query,
 * headers), paging through next_page, and the cost it computes from the documented response shape.
 * No key or network is needed.
 */

import http from "node:http";
import type { AddressInfo } from "node:net";
import { describe, it, expect, afterAll } from "vitest";
import { adminKeyFromEnv, fetchAnthropicUsage } from "../src/anthropic-usage.js";

const requests: Array<{ url: string; key: string | undefined }> = [];

const server = http.createServer((req, res) => {
  requests.push({ url: req.url ?? "", key: req.headers["x-api-key"] as string | undefined });
  const second = (req.url ?? "").includes("page=page_2");
  const row = {
    model: "claude-sonnet-4-6",
    uncached_input_tokens: 1500,
    cache_creation: { ephemeral_5m_input_tokens: 1000, ephemeral_1h_input_tokens: 100 },
    cache_read_input_tokens: 200,
    output_tokens: 500,
    server_tool_use: { web_search_requests: 0 },
  };
  const body = second
    ? { data: [{ starting_at: "2026-10-02T00:00:00Z", ending_at: "2026-10-03T00:00:00Z", results: [row] }], has_more: false, next_page: null }
    : {
        data: [
          { starting_at: "2026-10-01T00:00:00Z", ending_at: "2026-10-02T00:00:00Z", results: [row] },
          { starting_at: "2026-10-01T12:00:00Z", ending_at: "2026-10-02T00:00:00Z", results: [] },
        ],
        has_more: true,
        next_page: "page_2",
      };
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
});

afterAll(() => {
  server.close();
});

describe("agentmoney usage", () => {
  it("reads every page of the Usage API and prices each row", async () => {
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;
    const before = process.env.ANTHROPIC_BASE_URL;
    process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${port}`;
    try {
      const days = await fetchAnthropicUsage("sk-ant-admin01-test", 3);
      expect(requests).toHaveLength(2);
      expect(requests[0].url.startsWith("/v1/organizations/usage_report/messages?")).toBe(true);
      expect(requests[0].url).toContain("bucket_width=1d");
      expect(requests[0].url).toContain("group_by[]=model");
      expect(requests[1].url).toContain("page=page_2");
      expect(requests.every((r) => r.key === "sk-ant-admin01-test")).toBe(true);

      // input 1500 x $3 + output 500 x $15 + cache read 200 x $0.30 + 5m write 1000 x $3.75 + 1h write 100 x $6,
      // per million tokens = $0.01641 per row.
      expect(days.map((d) => d.date)).toEqual(["2026-10-01", "2026-10-02"]);
      for (const d of days) {
        expect(d.totalCost).toBeCloseTo(0.01641, 8);
        expect(d.totalCacheWriteTokens).toBe(1100);
        expect(d.byModel["claude-sonnet-4-6"].tokens).toBe(3300);
      }
    } finally {
      if (before === undefined) delete process.env.ANTHROPIC_BASE_URL;
      else process.env.ANTHROPIC_BASE_URL = before;
    }
  });

  it("sends only an admin key", () => {
    expect(adminKeyFromEnv({ ANTHROPIC_ADMIN_KEY: "sk-ant-admin01-a" })).toBe("sk-ant-admin01-a");
    expect(adminKeyFromEnv({ ANTHROPIC_API_KEY: "sk-ant-admin01-b" })).toBe("sk-ant-admin01-b");
    expect(adminKeyFromEnv({ ANTHROPIC_API_KEY: "sk-ant-api03-c" })).toBeUndefined();
    expect(adminKeyFromEnv({})).toBeUndefined();
  });
});
