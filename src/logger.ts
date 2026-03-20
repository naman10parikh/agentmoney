import { writeFileSync, appendFileSync, mkdirSync, existsSync } from "node:fs";
import type { CostTracker } from "./tracker.js";
import type { ApiCall } from "./types.js";

const LOG_DIR = ".agentmoney";

function ensureLogDir(): void {
  if (!existsSync(LOG_DIR)) {
    mkdirSync(LOG_DIR, { recursive: true });
  }
}

export function logCall(call: ApiCall): void {
  ensureLogDir();
  const line = JSON.stringify(call) + "\n";
  appendFileSync(`${LOG_DIR}/calls.jsonl`, line);
}

export function writeReport(tracker: CostTracker): string {
  ensureLogDir();
  const date = new Date().toISOString().slice(0, 10);
  const filename = `${LOG_DIR}/report-${date}.json`;

  const report = {
    date,
    generatedAt: new Date().toISOString(),
    totalCost: tracker.getTotalCost(),
    totalCalls: tracker.getTotalCalls(),
    costByModel: tracker.getCostByModel(),
    costByProvider: tracker.getCostByProvider(),
    sessions: tracker.getAllSessions().map((s) => ({
      id: s.id,
      startedAt: s.startedAt,
      totalCost: s.totalCost,
      callCount: s.calls.length,
      inputTokens: s.totalInputTokens,
      outputTokens: s.totalOutputTokens,
    })),
  };

  writeFileSync(filename, JSON.stringify(report, null, 2));
  return filename;
}

export function writeMarkdownReport(tracker: CostTracker): string {
  ensureLogDir();
  const date = new Date().toISOString().slice(0, 10);
  const filename = `${LOG_DIR}/report-${date}.md`;
  const byModel = tracker.getCostByModel();

  let md = `# agentmoney report — ${date}\n\n`;
  md += `| Metric | Value |\n|--------|-------|\n`;
  md += `| Total cost | $${tracker.getTotalCost().toFixed(4)} |\n`;
  md += `| Total calls | ${tracker.getTotalCalls()} |\n`;
  md += `| Sessions | ${tracker.getAllSessions().length} |\n\n`;

  md += `## By model\n\n`;
  md += `| Model | Calls | Cost | Tokens |\n|-------|-------|------|--------|\n`;
  for (const [model, stats] of Object.entries(byModel)) {
    md += `| ${model} | ${stats.calls} | $${stats.cost.toFixed(4)} | ${stats.tokens.toLocaleString()} |\n`;
  }

  writeFileSync(filename, md);
  return filename;
}
