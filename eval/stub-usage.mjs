#!/usr/bin/env node
// eval/stub-usage.mjs: a stand-in for the Anthropic Usage API (GET /v1/organizations/usage_report/messages), so the
// golden eval runs `agentmoney usage` with no admin key and no network. It answers in the documented shape, over two
// pages (the first says has_more with next_page "page_2"), one claude-sonnet-4-6 row per day.
// Prints the port on its first line, then appends one JSON line per request to STUB_LOG.
import { createServer } from "node:http";
import { appendFileSync } from "node:fs";

const row = {
  model: "claude-sonnet-4-6",
  uncached_input_tokens: 1500,
  cache_creation: { ephemeral_5m_input_tokens: 1000, ephemeral_1h_input_tokens: 100 },
  cache_read_input_tokens: 200,
  output_tokens: 500,
  server_tool_use: { web_search_requests: 0 },
};

const server = createServer((req, res) => {
  const url = req.url ?? "";
  if (process.env.STUB_LOG) {
    appendFileSync(process.env.STUB_LOG, JSON.stringify({ url, key: req.headers["x-api-key"] ?? null }) + "\n");
  }
  if (!url.startsWith("/v1/organizations/usage_report/messages")) {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ type: "error", error: { type: "not_found_error", message: "Not found" } }));
    return;
  }
  const second = url.includes("page=page_2");
  const day = second ? "2026-10-02" : "2026-10-01";
  const next = second ? "2026-10-03" : "2026-10-02";
  res.writeHead(200, { "content-type": "application/json" });
  res.end(
    JSON.stringify({
      data: [{ starting_at: `${day}T00:00:00Z`, ending_at: `${next}T00:00:00Z`, results: [row] }],
      has_more: !second,
      next_page: second ? null : "page_2",
    }),
  );
});

server.listen(0, "127.0.0.1", () => {
  console.log(server.address().port);
});
