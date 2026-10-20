// sandbox-runner.ts — run agentmoney's core cost-tracking action inside an
// isolated E2B Firecracker microVM (@e2b/sdk).
//
// Why a sandbox: agentmoney's `proxy` and the cost engine routinely process
// UNTRUSTED data — raw API response bodies and arbitrary agent-supplied call
// logs (model names, token counts) that arrive over the wire. Pricing a batch
// of agent-supplied calls means parsing input we did not author. Running that
// core action inside an E2B sandbox isolates it from the host filesystem and
// network, so a malformed/hostile call log can never touch the operator's
// machine. The sandbox boots in ~150ms, runs the pricing computation, and is
// torn down. The program it runs is built by sandbox-pricer.ts.
//
// Reference pattern: energy/packages/runtime/src/sandbox/container-runner.ts.

import { Sandbox } from "@e2b/sdk";
import { calculateCost, detectProvider } from "./pricing.js";
import { buildSandboxPricer } from "./sandbox-pricer.js";

/** One untrusted, agent-supplied API call to price inside the sandbox. */
export interface SandboxCallInput {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}

/** Result of pricing a batch of calls in an isolated sandbox. */
export interface SandboxRunResult {
  sandboxId: string;
  bootMs: number;
  runMs: number;
  exitCode: number;
  /** Parsed cost breakdown emitted by the in-sandbox pricing run. */
  totalCost: number;
  calls: Array<{
    model: string;
    provider: string;
    totalCost: number;
  }>;
  /** Raw stdout from the sandbox (the JSON the pricing script printed). */
  stdout: string;
  stderr: string;
}

/**
 * Boot an E2B sandbox, price the (untrusted) call log inside it, tear it down.
 * Requires E2B_API_KEY in the environment (loaded from this repo's .env).
 */
export async function runPricingInSandbox(
  calls: SandboxCallInput[],
): Promise<SandboxRunResult> {
  const apiKey = process.env["E2B_API_KEY"];
  if (!apiKey) {
    throw new Error(
      "E2B_API_KEY is required for sandbox-run (add it to .env). " +
        "Get one at https://e2b.dev/dashboard.",
    );
  }

  const bootStart = Date.now();
  // Firecracker microVM, isolated FS + network. ~150ms cold start.
  const sandbox = await Sandbox.create({ apiKey });
  const bootMs = Date.now() - bootStart;

  try {
    // Write the untrusted input and the self-contained pricer INTO the sandbox.
    await sandbox.files.write("/tmp/calls.json", JSON.stringify(calls));
    await sandbox.files.write("/tmp/pricer.cjs", buildSandboxPricer());

    const runStart = Date.now();
    const res = await sandbox.commands.run("node /tmp/pricer.cjs");
    const runMs = Date.now() - runStart;

    let parsed: { totalCost: number; calls: Array<{ model: string; totalCost: number }> } = {
      totalCost: 0,
      calls: [],
    };
    try {
      parsed = JSON.parse(res.stdout.trim());
    } catch {
      // Intentionally silent: stdout is surfaced raw below for debugging.
    }

    return {
      sandboxId: sandbox.sandboxId,
      bootMs,
      runMs,
      exitCode: res.exitCode,
      totalCost: parsed.totalCost,
      calls: parsed.calls.map((c) => ({
        model: c.model,
        provider: detectProvider(c.model),
        totalCost: c.totalCost,
      })),
      stdout: res.stdout,
      stderr: res.stderr,
    };
  } finally {
    // Always tear the sandbox down — no orphaned microVMs.
    await sandbox.kill();
  }
}

/**
 * Host-side cross-check: price the same calls with the real pricing engine.
 * Used by `sandbox-run` to prove the isolated run agrees with the host engine.
 */
export function priceOnHost(calls: SandboxCallInput[]): number {
  return calls.reduce((sum, c) => {
    return (
      sum +
      calculateCost(
        c.model,
        c.inputTokens,
        c.outputTokens,
        c.cacheReadTokens ?? 0,
        c.cacheWriteTokens ?? 0,
      ).totalCost
    );
  }, 0);
}
