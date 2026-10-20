// sandbox-pricer.ts: the pricing program that runs inside the E2B sandbox (see sandbox-runner.ts).
//
// The program imports nothing, so the untrusted call log never meets host code. Its rate table is generated from
// src/pricing.ts and it matches model names the same way (exact, then prefix, then contains, longest name first),
// so the sandbox total and the host check agree for every model, cache tokens included.

import { calculateCost, listModels } from "./pricing.js";

interface SandboxRate {
  in: number;
  out: number;
  cacheRead: number;
  cacheWrite: number;
}

/** USD per million tokens for every model the host engine knows, as the engine charges them. */
export function sandboxRates(): Record<string, SandboxRate> {
  const rates: Record<string, SandboxRate> = {};
  for (const model of listModels()) {
    rates[model] = {
      in: calculateCost(model, 1_000_000, 0).inputCost,
      out: calculateCost(model, 0, 1_000_000).outputCost,
      cacheRead: calculateCost(model, 0, 0, 1_000_000, 0).cacheCost,
      cacheWrite: calculateCost(model, 0, 0, 0, 1_000_000).cacheCost,
    };
  }
  return rates;
}

/** The self-contained Node script. It reads the call log from argv[2] (default /tmp/calls.json). */
export function buildSandboxPricer(): string {
  return `
const fs = require("node:fs");
// USD per 1M tokens, generated from src/pricing.ts. Unknown models: $3 in, $15 out, no cache charge.
const RATES = ${JSON.stringify(sandboxRates())};
const KEYS = Object.keys(RATES).sort((a, b) => b.length - a.length);
function rate(model) {
  const m = String(model);
  if (RATES[m]) return RATES[m];
  for (const k of KEYS) if (m.startsWith(k)) return RATES[k];
  for (const k of KEYS) if (m.includes(k)) return RATES[k];
  return { in: 3, out: 15, cacheRead: 0, cacheWrite: 0 };
}
const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const calls = JSON.parse(fs.readFileSync(process.argv[2] || "/tmp/calls.json", "utf8"));
let total = 0;
const out = [];
for (const c of calls) {
  const r = rate(c.model);
  const cost =
    (n(c.inputTokens) * r.in + n(c.outputTokens) * r.out + n(c.cacheReadTokens) * r.cacheRead + n(c.cacheWriteTokens) * r.cacheWrite) / 1e6;
  total += cost;
  out.push({ model: c.model, totalCost: cost });
}
console.log(JSON.stringify({ totalCost: total, calls: out }));
`;
}
