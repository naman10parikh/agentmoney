/**
 * Proxy round-trip integration test.
 *
 * Starts the real Express proxy on a random port, spins up a tiny mock upstream
 * server that returns a valid Anthropic-shaped response, fires an HTTP POST
 * through the proxy, and asserts that:
 *   1. The proxy forwards the request and returns the upstream response.
 *   2. The CostTracker recorded exactly one call with the expected cost.
 *   3. GET /health and GET /costs reflect the accumulated spend.
 *
 * No real API credentials are required — the upstream is a local http.Server.
 */

import http from "node:http";
import { describe, it, expect, afterAll } from "vitest";
import { CostTracker } from "../src/tracker.js";
import { createProxy } from "../src/proxy.js";
import type { AddressInfo } from "node:net";

// ── helpers ──────────────────────────────────────────────────────────────────

/** Start an http.Server on a random OS-assigned port, resolve with the base URL. */
function startServer(
  handler: http.RequestListener,
): Promise<{ url: string; close: () => void }> {
  return new Promise((resolve, reject) => {
    const server = http.createServer(handler);
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () => server.close(),
      });
    });
  });
}

/** Perform an HTTP request and return { statusCode, body }. */
async function httpPost(
  url: string,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<{ statusCode: number; body: string }> {
  const raw = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = http.request(
      {
        hostname: parsed.hostname,
        port: parseInt(parsed.port),
        path: parsed.pathname,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(raw),
          // simulate Anthropic client — proxy uses x-api-key to detect provider
          "x-api-key": "test-key",
          ...headers,
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk: Buffer) => { data += chunk.toString(); });
        res.on("end", () =>
          resolve({ statusCode: res.statusCode ?? 0, body: data }),
        );
      },
    );
    req.on("error", reject);
    req.write(raw);
    req.end();
  });
}

/** GET a URL with http.request, return body string. */
async function httpGet(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = http.request(
      {
        hostname: parsed.hostname,
        port: parseInt(parsed.port),
        path: parsed.pathname,
        method: "GET",
      },
      (res) => {
        let data = "";
        res.on("data", (chunk: Buffer) => { data += chunk.toString(); });
        res.on("end", () => resolve(data));
      },
    );
    req.on("error", reject);
    req.end();
  });
}

// ── mock upstream response (Anthropic-shaped) ───────────────────────────────

const MOCK_RESPONSE = {
  id: "msg_test001",
  type: "message",
  role: "assistant",
  model: "claude-sonnet-4-6",
  content: [{ type: "text", text: "Hello from mock upstream!" }],
  stop_reason: "end_turn",
  usage: {
    input_tokens: 10,
    output_tokens: 5,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
  },
};

// ── test suite ───────────────────────────────────────────────────────────────

describe("proxy integration — real round-trip", () => {
  let upstreamUrl = "";
  let proxyUrl = "";
  let tracker: CostTracker;
  let closeUpstream: () => void;
  let closeProxy: () => void;

  // Stand up both servers once for the entire suite
  it("setup: starts upstream mock and proxy", async () => {
    // 1. Mock upstream — always returns MOCK_RESPONSE
    const upstream = await startServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(MOCK_RESPONSE));
    });
    upstreamUrl = upstream.url;
    closeUpstream = upstream.close;

    // 2. Real proxy pointing at mock upstream
    tracker = new CostTracker();
    tracker.startSession("integration-test");
    const proxyApp = createProxy(tracker, upstreamUrl, 0);
    const proxyServer = await startServer(
      proxyApp as unknown as http.RequestListener,
    );
    proxyUrl = proxyServer.url;
    closeProxy = proxyServer.close;

    expect(upstreamUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(proxyUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  });

  it("proxies POST /v1/messages and returns the upstream response", async () => {
    const { statusCode, body } = await httpPost(
      `${proxyUrl}/v1/messages`,
      {
        model: "claude-sonnet-4-6",
        max_tokens: 16,
        messages: [{ role: "user", content: "hi" }],
      },
    );

    expect(statusCode).toBe(200);
    const parsed = JSON.parse(body) as typeof MOCK_RESPONSE;
    expect(parsed.id).toBe("msg_test001");
    expect(parsed.content[0].text).toBe("Hello from mock upstream!");
  });

  it("records the call cost in the tracker after the proxy round-trip", () => {
    // The previous test POSTed one call with input=10, output=5
    expect(tracker.getTotalCalls()).toBe(1);
    const session = tracker.getCurrentSession()!;
    expect(session.totalInputTokens).toBe(10);
    expect(session.totalOutputTokens).toBe(5);
    // claude-sonnet-4-6: $3/$15 per 1M tokens → 10 input = $0.00003, 5 output = $0.000075
    expect(session.totalCost).toBeGreaterThan(0);
    expect(session.totalCost).toBeCloseTo(0.000105, 6);
  });

  it("GET /health returns ok with accumulated cost", async () => {
    const body = await httpGet(`${proxyUrl}/health`);
    const json = JSON.parse(body) as {
      status: string;
      totalCost: number;
      totalCalls: number;
    };
    expect(json.status).toBe("ok");
    expect(json.totalCalls).toBe(1);
    expect(json.totalCost).toBeGreaterThan(0);
  });

  it("GET /costs returns model breakdown with anthropic entry", async () => {
    const body = await httpGet(`${proxyUrl}/costs`);
    const json = JSON.parse(body) as {
      totalCost: number;
      costByModel: Record<string, { calls: number; cost: number }>;
      costByProvider: Record<string, { calls: number; cost: number }>;
    };
    expect(json.costByModel["claude-sonnet-4-6"].calls).toBe(1);
    expect(json.costByProvider["anthropic"].calls).toBe(1);
  });

  it("second POST accumulates a second call", async () => {
    await httpPost(
      `${proxyUrl}/v1/messages`,
      {
        model: "claude-sonnet-4-6",
        max_tokens: 16,
        messages: [{ role: "user", content: "second call" }],
      },
    );

    expect(tracker.getTotalCalls()).toBe(2);
  });

  // Tear down after all tests finish
  afterAll(() => {
    closeProxy?.();
    closeUpstream?.();
  });
});
