import chalk from "chalk";
import type { CostTracker } from "./tracker.js";

function formatCost(cost: number): string {
  if (cost >= 1) return `$${cost.toFixed(2)}`;
  if (cost >= 0.01) return `$${cost.toFixed(4)}`;
  return `$${cost.toFixed(6)}`;
}

function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`;
  return `${tokens}`;
}

function bar(value: number, max: number, width: number): string {
  const filled = max > 0 ? Math.round((value / max) * width) : 0;
  const empty = width - filled;
  return chalk.green("█".repeat(filled)) + chalk.dim("░".repeat(empty));
}

export function printDashboard(tracker: CostTracker): void {
  const totalCost = tracker.getTotalCost();
  const totalCalls = tracker.getTotalCalls();
  const costPerMin = tracker.getRunningCostPerMinute();
  const session = tracker.getCurrentSession();
  const byModel = tracker.getCostByModel();

  console.clear();
  console.log();
  console.log(
    chalk.cyan.bold("  agentmoney") + chalk.dim(" — real-time cost tracker"),
  );
  console.log(chalk.dim("  ─".repeat(24)));
  console.log();

  // Summary
  const costColor =
    totalCost > 5 ? chalk.red : totalCost > 1 ? chalk.yellow : chalk.green;
  console.log(`  Total cost:     ${costColor.bold(formatCost(totalCost))}`);
  console.log(`  API calls:      ${chalk.white.bold(String(totalCalls))}`);
  console.log(`  Cost/min:       ${chalk.white(formatCost(costPerMin))}`);

  if (session) {
    const projected = costPerMin * 60;
    console.log(`  Projected/hr:   ${chalk.yellow(formatCost(projected))}`);
  }

  console.log();

  // Per-model breakdown
  if (Object.keys(byModel).length > 0) {
    console.log(chalk.dim("  By model:"));
    const maxCost = Math.max(...Object.values(byModel).map((m) => m.cost));

    for (const [model, stats] of Object.entries(byModel)) {
      const shortModel = model.length > 25 ? model.slice(0, 22) + "..." : model;
      const padded = shortModel.padEnd(26);
      console.log(
        `  ${padded} ${bar(stats.cost, maxCost, 12)} ${formatCost(stats.cost).padStart(10)} ${chalk.dim(`(${stats.calls} calls, ${formatTokens(stats.tokens)} tokens)`)}`,
      );
    }
  }

  console.log();

  // Session info
  if (session) {
    const elapsed = (Date.now() - new Date(session.startedAt).getTime()) / 1000;
    const mins = Math.floor(elapsed / 60);
    const secs = Math.floor(elapsed % 60);
    console.log(
      chalk.dim(
        `  Session: ${session.id} | ${mins}m ${secs}s | ${session.calls.length} calls`,
      ),
    );
  }

  console.log();
}

export function printSummary(tracker: CostTracker): void {
  const totalCost = tracker.getTotalCost();
  const totalCalls = tracker.getTotalCalls();
  const byModel = tracker.getCostByModel();
  const byProvider = tracker.getCostByProvider();
  const sessions = tracker.getAllSessions();

  console.log();
  console.log(chalk.cyan.bold("agentmoney summary"));
  console.log(chalk.dim("─".repeat(50)));
  console.log();
  console.log(`  Total cost:      ${chalk.bold(formatCost(totalCost))}`);
  console.log(`  Total calls:     ${totalCalls}`);
  console.log(`  Sessions:        ${sessions.length}`);
  console.log();

  if (Object.keys(byProvider).length > 0) {
    console.log(chalk.dim("  By provider:"));
    for (const [provider, stats] of Object.entries(byProvider)) {
      console.log(
        `    ${provider.padEnd(12)} ${formatCost(stats.cost).padStart(10)}  (${stats.calls} calls)`,
      );
    }
    console.log();
  }

  if (Object.keys(byModel).length > 0) {
    console.log(chalk.dim("  By model:"));
    for (const [model, stats] of Object.entries(byModel)) {
      console.log(
        `    ${model.padEnd(30)} ${formatCost(stats.cost).padStart(10)}  (${stats.calls} calls, ${formatTokens(stats.tokens)} tokens)`,
      );
    }
    console.log();
  }

  for (const session of sessions) {
    console.log(
      chalk.dim(
        `  Session ${session.id}: ${formatCost(session.totalCost)} (${session.calls.length} calls)`,
      ),
    );
  }

  console.log();
}

export function printJson(tracker: CostTracker): void {
  console.log(
    JSON.stringify(
      {
        totalCost: tracker.getTotalCost(),
        totalCalls: tracker.getTotalCalls(),
        costByModel: tracker.getCostByModel(),
        costByProvider: tracker.getCostByProvider(),
        costPerMinute: tracker.getRunningCostPerMinute(),
        sessions: tracker.getAllSessions(),
      },
      null,
      2,
    ),
  );
}
