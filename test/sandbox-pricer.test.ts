/**
 * The program `sandbox-run` sends into the E2B microVM must price exactly like the host engine, or the
 * "Host check" line it prints is meaningless. This runs the generated program with local Node (no sandbox, no key)
 * on every model the engine knows, cache tokens included, plus suffixed, prefixed and unknown names.
 */

import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildSandboxPricer } from "../src/sandbox-pricer.js";
import { calculateCost, listModels } from "../src/pricing.js";

interface Call {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}

describe("the in-sandbox pricer", () => {
  it("agrees with the host engine for every model and odd names", () => {
    const calls: Call[] = [
      ...listModels().map((model) => ({
        model,
        inputTokens: 12_345,
        outputTokens: 678,
        cacheReadTokens: 9_000,
        cacheWriteTokens: 1_500,
      })),
      { model: "claude-sonnet-4-6-20260301", inputTokens: 1_000, outputTokens: 100 },
      { model: "anthropic/claude-haiku-4-5", inputTokens: 1_000, outputTokens: 100 },
      { model: "a-model-nobody-priced", inputTokens: 1_000, outputTokens: 100, cacheReadTokens: 50 },
    ];
    const dir = mkdtempSync(join(tmpdir(), "agentmoney-pricer-"));
    writeFileSync(join(dir, "pricer.cjs"), buildSandboxPricer());
    writeFileSync(join(dir, "calls.json"), JSON.stringify(calls));

    const out = JSON.parse(
      execFileSync(process.execPath, [join(dir, "pricer.cjs"), join(dir, "calls.json")], { encoding: "utf8" }),
    ) as { totalCost: number; calls: Array<{ model: string; totalCost: number }> };

    expect(out.calls).toHaveLength(calls.length);
    let hostTotal = 0;
    calls.forEach((c, i) => {
      const host = calculateCost(c.model, c.inputTokens, c.outputTokens, c.cacheReadTokens ?? 0, c.cacheWriteTokens ?? 0);
      hostTotal += host.totalCost;
      expect(out.calls[i].totalCost).toBeCloseTo(host.totalCost, 10);
    });
    expect(out.totalCost).toBeCloseTo(hostTotal, 10);
  });
});
