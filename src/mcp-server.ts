#!/usr/bin/env node
/**
 * agentmoney MCP server — exposes a `cost_query` tool over stdio JSON-RPC.
 *
 * Compatible with the MCP 2025-11-05 specification (stdio transport).
 * No external @modelcontextprotocol/sdk dependency — implemented as plain
 * JSON-RPC 2.0 over stdin/stdout so it works without npm install.
 *
 * Usage (add to .mcp.json or .claude-plugin/manifest.json):
 *   command: "node"
 *   args: ["dist/mcp-server.js"]
 *
 * Tool exposed: cost_query
 *   Calculate the cost of an LLM API call given model + token counts.
 *   Inputs:
 *     model          (string, required) — e.g. "claude-sonnet-4-6"
 *     input_tokens   (number, required) — input token count
 *     output_tokens  (number, required) — output token count
 *     cache_read_tokens  (number, optional, default 0)
 *     cache_write_tokens (number, optional, default 0)
 *   Returns JSON text with inputCost, outputCost, cacheCost, totalCost (all in USD).
 */

import { calculateCost, detectProvider, listModels } from "./pricing.js";

// ── JSON-RPC types (minimal) ─────────────────────────────────────────────────

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

// ── Tool definition ──────────────────────────────────────────────────────────

const COST_QUERY_TOOL = {
  name: "cost_query",
  description:
    "Calculate the USD cost of an LLM API call. " +
    "Supports all Claude, OpenAI, and Gemini models. " +
    "Returns itemised input, output, cache, and total costs.",
  inputSchema: {
    type: "object",
    properties: {
      model: {
        type: "string",
        description:
          'Model identifier (e.g. "claude-sonnet-4-6", "gpt-4o", "gemini-2.0-flash"). ' +
          "Fuzzy-matched — date suffixes and provider prefixes are handled automatically.",
      },
      input_tokens: {
        type: "number",
        description: "Number of input (prompt) tokens.",
      },
      output_tokens: {
        type: "number",
        description: "Number of output (completion) tokens.",
      },
      cache_read_tokens: {
        type: "number",
        description: "Cache-read tokens (Anthropic prompt caching). Default 0.",
      },
      cache_write_tokens: {
        type: "number",
        description: "Cache-write tokens (Anthropic prompt caching). Default 0.",
      },
    },
    required: ["model", "input_tokens", "output_tokens"],
    additionalProperties: false,
  },
};

// ── Handlers ─────────────────────────────────────────────────────────────────

function handleInitialize(): unknown {
  return {
    protocolVersion: "2025-11-05",
    serverInfo: { name: "agentmoney", version: "1.0.0" },
    capabilities: { tools: {} },
  };
}

function handleToolsList(): unknown {
  return { tools: [COST_QUERY_TOOL] };
}

function handleToolCall(params: Record<string, unknown>): unknown {
  const name = params["name"] as string | undefined;
  if (name !== "cost_query") {
    throw { code: -32601, message: `Unknown tool: ${name ?? "(missing)"}` };
  }

  const args = (params["arguments"] ?? {}) as Record<string, unknown>;
  const model = args["model"] as string | undefined;
  const inputTokens = args["input_tokens"] as number | undefined;
  const outputTokens = args["output_tokens"] as number | undefined;

  if (!model || inputTokens === undefined || outputTokens === undefined) {
    throw {
      code: -32602,
      message:
        "cost_query requires: model (string), input_tokens (number), output_tokens (number)",
    };
  }

  const cacheRead = (args["cache_read_tokens"] as number | undefined) ?? 0;
  const cacheWrite = (args["cache_write_tokens"] as number | undefined) ?? 0;

  const costs = calculateCost(
    model,
    inputTokens,
    outputTokens,
    cacheRead,
    cacheWrite,
  );

  const provider = detectProvider(model);
  const knownModels = listModels();
  const isKnown = knownModels.some(
    (m) => model.startsWith(m) || model.includes(m),
  );

  const result = {
    model,
    provider,
    known: isKnown,
    inputTokens,
    outputTokens,
    cacheReadTokens: cacheRead,
    cacheWriteTokens: cacheWrite,
    inputCost: costs.inputCost,
    outputCost: costs.outputCost,
    cacheCost: costs.cacheCost,
    totalCost: costs.totalCost,
    currency: "USD",
    note: isKnown
      ? "Exact pricing match."
      : "Unknown model — estimated at Sonnet-tier ($3/$15 per MTok).",
  };

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(result, null, 2),
      },
    ],
    isError: false,
  };
}

// ── Main loop (stdio JSON-RPC) ───────────────────────────────────────────────

function respond(res: JsonRpcResponse): void {
  process.stdout.write(JSON.stringify(res) + "\n");
}

function dispatch(req: JsonRpcRequest): void {
  try {
    let result: unknown;
    if (req.method === "initialize") {
      result = handleInitialize();
    } else if (req.method === "notifications/initialized") {
      // No response needed for notifications
      return;
    } else if (req.method === "tools/list") {
      result = handleToolsList();
    } else if (req.method === "tools/call") {
      result = handleToolCall((req.params ?? {}) as Record<string, unknown>);
    } else if (req.method === "ping") {
      result = {};
    } else {
      respond({
        jsonrpc: "2.0",
        id: req.id,
        error: { code: -32601, message: `Method not found: ${req.method}` },
      });
      return;
    }
    respond({ jsonrpc: "2.0", id: req.id, result });
  } catch (err: unknown) {
    const e = err as { code?: number; message?: string };
    respond({
      jsonrpc: "2.0",
      id: req.id,
      error: {
        code: e.code ?? -32603,
        message: e.message ?? "Internal error",
      },
    });
  }
}

function main(): void {
  let buffer = "";

  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk: string) => {
    buffer += chunk;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const req = JSON.parse(trimmed) as JsonRpcRequest;
        dispatch(req);
      } catch {
        respond({
          jsonrpc: "2.0",
          id: null,
          error: { code: -32700, message: "Parse error" },
        });
      }
    }
  });

  process.stdin.on("end", () => {
    process.exit(0);
  });
}

main();
