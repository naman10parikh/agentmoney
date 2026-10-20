#!/usr/bin/env node
// SessionStart hook: if this project has an agentmoney call log (.agentmoney/calls.jsonl, written by
// `agentmoney proxy`), tell the agent what was spent: total, today, and the top models. Read-only and silent when
// there is no log, so it costs nothing in projects that do not use agentmoney.
import { existsSync, openSync, readSync, closeSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const log = join(root, ".agentmoney", "calls.jsonl");
if (!existsSync(log)) process.exit(0);

// Read at most the last 2 MB, so a long-running proxy's log never slows a session start.
const MAX = 2 * 1024 * 1024;
const size = statSync(log).size;
const length = Math.min(size, MAX);
const buf = Buffer.alloc(length);
const fd = openSync(log, "r");
readSync(fd, buf, 0, length, size - length);
closeSync(fd);
let lines = buf.toString("utf8").split("\n");
if (size > MAX) lines = lines.slice(1); // the first line may be cut

const today = new Date().toISOString().slice(0, 10);
let calls = 0, total = 0, todayCalls = 0, todayCost = 0;
const byModel = {};
for (const line of lines) {
  if (!line.trim()) continue;
  let call;
  try {
    call = JSON.parse(line);
  } catch {
    continue; // Intentionally silent: one bad line should not hide the rest
  }
  const cost = Number(call.totalCost) || 0;
  calls += 1;
  total += cost;
  byModel[call.model ?? "unknown"] = (byModel[call.model ?? "unknown"] ?? 0) + cost;
  if (String(call.timestamp ?? "").startsWith(today)) {
    todayCalls += 1;
    todayCost += cost;
  }
}
if (calls === 0) process.exit(0);

const top = Object.entries(byModel)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 3)
  .map(([model, cost]) => `${model} $${cost.toFixed(4)}`)
  .join(", ");
const scope = size > MAX ? "in the newest 2 MB of" : "in";
const context =
  `agentmoney: ${calls} API calls ${scope} .agentmoney/calls.jsonl cost $${total.toFixed(4)}; ` +
  `today $${todayCost.toFixed(4)} over ${todayCalls} calls. Top models: ${top}. ` +
  "Ask the cost-analyst sub-agent or run `agentmoney usage` (needs an Admin API key) for the provider's numbers.";
process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: context } }));
