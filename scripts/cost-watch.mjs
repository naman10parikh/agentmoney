#!/usr/bin/env node
// cost-watch.mjs — the routing/gate step of the Cost Watch dispatch loop
// (.github/workflows/cost-watch.yml). Reads the newest .agentmoney/report-*.json
// (produced by `agentmoney demo` / the proxy) and ROUTES on the result:
//   total <= budget  -> PASS, exit 0 (the scheduled run stays green)
//   total  > budget  -> BREACH, exit 1 (the run goes red = the alert)
//   no report found  -> exit 1 (a cost watch that can't find its report is broken)
//
// Stdlib only on purpose: the gate must not depend on the package it is gating.
// Usage: node scripts/cost-watch.mjs --budget 1.00

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const LOG_DIR = ".agentmoney"; // same dir src/logger.ts writes reports to

function parseBudget(argv) {
  const i = argv.indexOf("--budget");
  const raw = i !== -1 && argv[i + 1] ? argv[i + 1] : "1.00";
  const budget = Number.parseFloat(raw);
  if (!Number.isFinite(budget) || budget <= 0) {
    console.error(`cost-watch: invalid --budget "${raw}" (need a positive USD number)`);
    process.exit(1);
  }
  return budget;
}

function latestReportPath() {
  if (!existsSync(LOG_DIR)) return null;
  const reports = readdirSync(LOG_DIR)
    .filter((f) => /^report-\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort(); // ISO dates sort lexicographically — last entry is newest
  if (reports.length === 0) return null;
  return join(LOG_DIR, reports[reports.length - 1]);
}

const budget = parseBudget(process.argv.slice(2));
const reportPath = latestReportPath();

if (!reportPath) {
  console.error(`cost-watch: no ${LOG_DIR}/report-YYYY-MM-DD.json found — run \`agentmoney demo\` or the proxy first.`);
  process.exit(1);
}

let report;
try {
  report = JSON.parse(readFileSync(reportPath, "utf8"));
} catch (err) {
  console.error(`cost-watch: failed to parse ${reportPath}: ${err.message}`);
  process.exit(1);
}

const total = Number(report.totalCost ?? 0);
const calls = Number(report.totalCalls ?? 0);
const byModel = report.costByModel ?? {};
const topModel = Object.entries(byModel).sort((a, b) => b[1].cost - a[1].cost)[0];

console.log(`cost-watch: ${reportPath}`);
console.log(`  total:   $${total.toFixed(4)} across ${calls} calls`);
if (topModel) {
  console.log(`  top:     ${topModel[0]} ($${topModel[1].cost.toFixed(4)}, ${topModel[1].calls} calls)`);
}
console.log(`  budget:  $${budget.toFixed(2)}`);

if (total > budget) {
  console.error(`  verdict: BREACH — $${total.toFixed(4)} > $${budget.toFixed(2)} budget cap`);
  process.exit(1);
}
console.log(`  verdict: PASS — under budget`);
