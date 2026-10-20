import express from "express";
import type { CostTracker } from "./tracker.js";
import { renderDashboard } from "./dashboard.js";

// Extract token usage from Anthropic API response
function parseAnthropicResponse(body: Record<string, unknown>): {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
} | null {
  const usage = body.usage as Record<string, number> | undefined;
  if (!usage) return null;

  return {
    model: (body.model as string) ?? "unknown",
    inputTokens: usage.input_tokens ?? 0,
    outputTokens: usage.output_tokens ?? 0,
    cacheReadTokens: usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
  };
}

// Extract token usage from OpenAI API response
function parseOpenAIResponse(body: Record<string, unknown>): {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
} | null {
  const usage = body.usage as
    | {
        prompt_tokens?: number;
        completion_tokens?: number;
        prompt_tokens_details?: { cached_tokens?: number };
      }
    | undefined;
  if (!usage) return null;

  return {
    model: (body.model as string) ?? "unknown",
    inputTokens: usage.prompt_tokens ?? 0,
    outputTokens: usage.completion_tokens ?? 0,
    cacheReadTokens: usage.prompt_tokens_details?.cached_tokens ?? 0,
    cacheWriteTokens: 0,
  };
}

// Read a usage block by its shape, not by the target or the auth header: Anthropic reports input_tokens, OpenAI
// prompt_tokens. A gateway or a Bearer token then still prices correctly.
function parseUsage(body: Record<string, unknown>): ReturnType<typeof parseAnthropicResponse> {
  const block = body.usage as Record<string, unknown> | undefined;
  return block && "input_tokens" in block
    ? parseAnthropicResponse(body)
    : parseOpenAIResponse(body);
}

// A streamed reply (server-sent events) carries its usage in its events. Anthropic sends the model and the input
// tokens in message_start, then the final output count in message_delta. OpenAI sends a last chunk with a usage
// block when the request sets stream_options.include_usage. With no usage in any event, the call is not priced.
function parseStreamedResponse(text: string): ReturnType<typeof parseAnthropicResponse> {
  let model: unknown;
  let usage: Record<string, unknown> | undefined;
  for (const line of text.split("\n")) {
    if (!line.startsWith("data:")) continue;
    let event: Record<string, unknown>;
    try {
      event = JSON.parse(line.slice(5)) as Record<string, unknown>;
    } catch {
      continue; // "[DONE]" and anything else that is not JSON
    }
    // Anthropic's message_start nests the message; OpenAI's Responses API nests the response.
    const inner = (event.message ?? event.response) as Record<string, unknown> | undefined;
    if (inner?.usage) {
      model = inner.model ?? model;
      usage = { ...(inner.usage as Record<string, unknown>) };
    }
    if (event.usage) {
      model = event.model ?? model;
      usage = { ...usage, ...(event.usage as Record<string, unknown>) };
    }
  }
  return usage ? parseUsage({ model, usage }) : null;
}

export function createProxy(
  tracker: CostTracker,
  targetUrl: string,
  port: number,
): express.Express {
  const app = express();
  app.use(express.json({ limit: "50mb" }));
  app.use(express.raw({ type: "application/octet-stream", limit: "50mb" }));

  // Health check
  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      totalCost: tracker.getTotalCost(),
      totalCalls: tracker.getTotalCalls(),
    });
  });

  // Web dashboard
  app.get("/dashboard", (_req, res) => {
    res.setHeader("Content-Type", "text/html");
    res.send(renderDashboard(tracker));
  });

  // Cost summary endpoint (JSON API)
  app.get("/costs", (_req, res) => {
    res.json({
      totalCost: tracker.getTotalCost(),
      totalCalls: tracker.getTotalCalls(),
      costByModel: tracker.getCostByModel(),
      costByProvider: tracker.getCostByProvider(),
      costPerMinute: tracker.getRunningCostPerMinute(),
      sessions: tracker.getAllSessions().map((s) => ({
        id: s.id,
        startedAt: s.startedAt,
        totalCost: s.totalCost,
        callCount: s.calls.length,
      })),
    });
  });

  // Proxy all other requests
  app.all("/*", async (req, res) => {
    const url = `${targetUrl}${req.path}`;
    const startTime = Date.now();

    try {
      const headers: Record<string, string> = {};
      for (const [key, value] of Object.entries(req.headers)) {
        if (key === "host" || key === "content-length") continue;
        if (typeof value === "string") headers[key] = value;
      }

      const fetchOptions: RequestInit = {
        method: req.method,
        headers,
      };

      if (req.method !== "GET" && req.method !== "HEAD" && req.body) {
        fetchOptions.body = JSON.stringify(req.body);
      }

      const upstream = await fetch(url, fetchOptions);
      const streamed = (upstream.headers.get("content-type") ?? "").includes("text/event-stream");

      // Forward response headers
      for (const [key, value] of upstream.headers.entries()) {
        if (key === "transfer-encoding" || key === "content-encoding") continue;
        if (streamed && key === "content-length") continue;
        res.setHeader(key, value);
      }

      // A streamed reply is passed on event by event as it arrives, and a copy is kept to price it at the end.
      let responseBody = "";
      if (streamed && upstream.body) {
        res.status(upstream.status);
        res.flushHeaders();
        const reader = upstream.body.getReader();
        const decoder = new TextDecoder();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          responseBody += decoder.decode(value, { stream: true });
          res.write(value);
        }
        responseBody += decoder.decode();
      } else {
        responseBody = await upstream.text();
      }
      const durationMs = Date.now() - startTime;

      // Try to parse and record usage
      try {
        const usage = streamed
          ? parseStreamedResponse(responseBody)
          : parseUsage(JSON.parse(responseBody) as Record<string, unknown>);

        if (usage) {
          tracker.recordCall({
            ...usage,
            durationMs,
            endpoint: req.path,
          });
        }
      } catch {
        // Response isn't JSON or doesn't have usage — that's fine
      }

      if (streamed && upstream.body) res.end();
      else res.status(upstream.status).send(responseBody);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[agentmoney] Proxy error: ${message}`);
      // A stream that fails part way has already sent its status, so it can only end.
      if (res.headersSent) res.end();
      else res.status(502).json({ error: "Proxy error", details: message });
    }
  });

  return app;
}
