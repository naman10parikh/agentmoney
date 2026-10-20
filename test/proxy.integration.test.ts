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

// ── mock streamed replies (server-sent events) ──────────────────────────────

// Anthropic: the model and input tokens come in message_start, the final output count in message_delta.
const ANTHROPIC_STREAM = [
  `event: message_start\ndata: {"type":"message_start","message":{"id":"msg_stream","type":"message","role":"assistant","model":"${MOCK_RESPONSE.model}","content":[],"usage":{"input_tokens":20,"cache_creation_input_tokens":0,"cache_read_input_tokens":0,"output_tokens":1}}}`,
  `event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hi"}}`,
  `event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":7}}`,
  `event: message_stop\ndata: {"type":"message_stop"}`,
].join("\n\n") + "\n\n";

// OpenAI: chunks carry "usage": null, then a last chunk carries the usage (stream_options.include_usage), then [DONE].
const OPENAI_STREAM = [
  `data: {"object":"chat.completion.chunk","model":"stream-test-model","choices":[{"index":0,"delta":{"content":"Hi"}}],"usage":null}`,
  `data: {"object":"chat.completion.chunk","model":"stream-test-model","choices":[],"usage":{"prompt_tokens":12,"completion_tokens":4,"total_tokens":16}}`,
  `data: [DONE]`,
].join("\n\n") + "\n\n";

// ── test suite ───────────────────────────────────────────────────────────────

describe("proxy integration — real round-trip", () => {
  let upstreamUrl = "";
  let proxyUrl = "";
  let tracker: CostTracker;
  let closeUpstream: () => void;
  let closeProxy: () => void;

  // Stand up both servers once for the entire suite
  it("setup: starts upstream mock and proxy", async () => {
    // 1. Mock upstream — returns MOCK_RESPONSE, or a streamed reply when the request asks for one
    const upstream = await startServer((req, res) => {
      let raw = "";
      req.on("data", (chunk: Buffer) => { raw += chunk.toString(); });
      req.on("end", () => {
        if ((JSON.parse(raw || "{}") as { stream?: boolean }).stream) {
          res.writeHead(200, { "Content-Type": "text/event-stream" });
          res.end(req.url === "/v1/chat/completions" ? OPENAI_STREAM : ANTHROPIC_STREAM);
          return;
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(MOCK_RESPONSE));
      });
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

  it("reads an Anthropic usage block by its shape, without an x-api-key header", async () => {
    // A gateway target and a Bearer token used to make the proxy read the block as OpenAI's and record zero tokens.
    await httpPost(
      `${proxyUrl}/v1/messages`,
      { model: "claude-sonnet-4-6", max_tokens: 16, messages: [{ role: "user", content: "bearer call" }] },
      { "x-api-key": "", authorization: "Bearer test-token" },
    );

    expect(tracker.getTotalCalls()).toBe(3);
    expect(tracker.getCurrentSession()!.totalInputTokens).toBe(30);
  });

  it("prices a streamed Anthropic reply from its message_start and message_delta events", async () => {
    const { statusCode, body } = await httpPost(`${proxyUrl}/v1/messages`, {
      model: MOCK_RESPONSE.model,
      max_tokens: 16,
      stream: true,
      messages: [{ role: "user", content: "stream" }],
    });

    expect(statusCode).toBe(200);
    expect(body).toBe(ANTHROPIC_STREAM); // the events reach the app unchanged
    expect(tracker.getTotalCalls()).toBe(4);
    const call = tracker.getCurrentSession()!.calls.at(-1)!;
    expect(call.model).toBe(MOCK_RESPONSE.model);
    expect(call.inputTokens).toBe(20);
    expect(call.outputTokens).toBe(7); // the final count, not message_start's 1
    expect(call.totalCost).toBeGreaterThan(0);
  });

  it("prices a streamed OpenAI reply from its last usage chunk", async () => {
    await httpPost(`${proxyUrl}/v1/chat/completions`, {
      model: "stream-test-model",
      stream: true,
      stream_options: { include_usage: true },
      messages: [{ role: "user", content: "stream" }],
    });

    expect(tracker.getTotalCalls()).toBe(5);
    const call = tracker.getCurrentSession()!.calls.at(-1)!;
    expect(call.model).toBe("stream-test-model");
    expect(call.inputTokens).toBe(12);
    expect(call.outputTokens).toBe(4);
  });

  it("passes a streamed reply on event by event, before the stream ends, and still prices it", async () => {
    // This upstream sends message_start, then holds the rest until the app has read it, or 2 seconds pass.
    let appReadFirst: () => void = () => {};
    const firstRead = new Promise<void>((resolve) => { appReadFirst = resolve; });
    const [head, ...rest] = ANTHROPIC_STREAM.split("\n\n").filter(Boolean);
    let upstreamEnded = false;
    let arrivedBeforeEnd = false;
    const slow = await startServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      res.write(`${head}\n\n`);
      void Promise.race([firstRead, new Promise((resolve) => setTimeout(resolve, 2000))]).then(() => {
        upstreamEnded = true;
        res.end(rest.map((event) => `${event}\n\n`).join(""));
      });
    });
    const own = new CostTracker();
    own.startSession("streaming");
    const proxy = await startServer(createProxy(own, slow.url, 0) as unknown as http.RequestListener);
    const body = await new Promise<string>((resolve, reject) => {
      const req = http.request(`${proxy.url}/v1/messages`, { method: "POST", headers: { "Content-Type": "application/json" } }, (res) => {
        let data = "";
        res.on("data", (chunk: Buffer) => {
          data += chunk.toString();
          if (data.includes("message_start")) {
            arrivedBeforeEnd ||= !upstreamEnded;
            appReadFirst();
          }
        });
        res.on("end", () => resolve(data));
      });
      req.on("error", reject);
      req.end(JSON.stringify({ model: MOCK_RESPONSE.model, stream: true }));
    });
    proxy.close();
    slow.close();

    expect(arrivedBeforeEnd).toBe(true);
    expect(body).toBe(ANTHROPIC_STREAM);
    expect(own.getTotalCalls()).toBe(1);
    expect(own.getCurrentSession()!.calls[0]!.outputTokens).toBe(7);
  });

  it("GET /dashboard refreshes before it draws the charts, and says offline that they need the internet", async () => {
    const html = await httpGet(`${proxyUrl}/dashboard`);
    expect(html).toContain("cdn.jsdelivr.net/npm/chart.js");
    expect(html).toContain("The charts need the internet");
    // The reload is set before any chart code, so a page whose Chart.js did not load still refreshes.
    expect(html.indexOf("location.reload()")).toBeLessThan(html.indexOf("new Chart("));
  });

  // Tear down after all tests finish
  afterAll(() => {
    closeProxy?.();
    closeUpstream?.();
  });
});
