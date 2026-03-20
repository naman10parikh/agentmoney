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
      const responseBody = await upstream.text();
      const durationMs = Date.now() - startTime;

      // Forward response headers
      for (const [key, value] of upstream.headers.entries()) {
        if (key === "transfer-encoding" || key === "content-encoding") continue;
        res.setHeader(key, value);
      }

      // Try to parse and record usage
      try {
        const parsed = JSON.parse(responseBody) as Record<string, unknown>;
        const isAnthropic =
          targetUrl.includes("anthropic") || req.headers["x-api-key"];
        const usage = isAnthropic
          ? parseAnthropicResponse(parsed)
          : parseOpenAIResponse(parsed);

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

      res.status(upstream.status).send(responseBody);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[agentmoney] Proxy error: ${message}`);
      res.status(502).json({ error: "Proxy error", details: message });
    }
  });

  return app;
}
