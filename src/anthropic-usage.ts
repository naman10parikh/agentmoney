import chalk from "chalk";
import { calculateCost, detectProvider } from "./pricing.js";

interface AnthropicUsageEntry {
  date: string;
  model: string;
  usage_type: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  api_calls: number;
}

interface UsageSummary {
  date: string;
  totalCost: number;
  totalCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  byModel: Record<string, { calls: number; cost: number; tokens: number }>;
}

export async function fetchAnthropicUsage(
  apiKey: string,
  days: number,
): Promise<UsageSummary[]> {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const start = startDate.toISOString().slice(0, 10);
  const end = endDate.toISOString().slice(0, 10);

  const url = `https://api.anthropic.com/v1/usage?start_date=${start}&end_date=${end}`;

  const response = await fetch(url, {
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("Invalid API key. Check your ANTHROPIC_API_KEY.");
    }
    if (response.status === 403) {
      throw new Error(
        "API key lacks usage permissions. The /v1/usage endpoint requires admin-level API keys. " +
          "Workspace member keys may not have access. Check console.anthropic.com/settings/keys.",
      );
    }
    throw new Error(
      `Anthropic API returned ${response.status}: ${await response.text()}`,
    );
  }

  const data = (await response.json()) as { data: AnthropicUsageEntry[] };

  // Group by date
  const byDate = new Map<string, AnthropicUsageEntry[]>();
  for (const entry of data.data ?? []) {
    const existing = byDate.get(entry.date) ?? [];
    existing.push(entry);
    byDate.set(entry.date, existing);
  }

  const summaries: UsageSummary[] = [];

  for (const [date, entries] of byDate) {
    const summary: UsageSummary = {
      date,
      totalCost: 0,
      totalCalls: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      byModel: {},
    };

    for (const entry of entries) {
      const costs = calculateCost(
        entry.model,
        entry.input_tokens,
        entry.output_tokens,
        entry.cache_read_tokens,
        entry.cache_write_tokens,
      );

      summary.totalCost += costs.totalCost;
      summary.totalCalls += entry.api_calls;
      summary.totalInputTokens += entry.input_tokens;
      summary.totalOutputTokens += entry.output_tokens;

      if (!summary.byModel[entry.model]) {
        summary.byModel[entry.model] = { calls: 0, cost: 0, tokens: 0 };
      }
      summary.byModel[entry.model].calls += entry.api_calls;
      summary.byModel[entry.model].cost += costs.totalCost;
      summary.byModel[entry.model].tokens +=
        entry.input_tokens + entry.output_tokens;
    }

    summaries.push(summary);
  }

  return summaries.sort((a, b) => a.date.localeCompare(b.date));
}

export function printUsageReport(summaries: UsageSummary[]): void {
  if (summaries.length === 0) {
    console.log(chalk.yellow("\n  No usage data found for this period.\n"));
    return;
  }

  const grandTotal = summaries.reduce((sum, s) => sum + s.totalCost, 0);
  const grandCalls = summaries.reduce((sum, s) => sum + s.totalCalls, 0);

  console.log();
  console.log(
    chalk.cyan.bold("agentmoney usage") + chalk.dim(" — Anthropic API"),
  );
  console.log(chalk.dim("─".repeat(60)));
  console.log();
  console.log(
    `  Period:      ${summaries[0].date} → ${summaries[summaries.length - 1].date}`,
  );
  console.log(`  Total cost:  ${chalk.bold(`$${grandTotal.toFixed(4)}`)}`);
  console.log(`  Total calls: ${grandCalls.toLocaleString()}`);
  console.log();

  // Daily breakdown
  console.log(
    chalk.dim(
      `  ${"Date".padEnd(12)} ${"Calls".padStart(8)} ${"Cost".padStart(12)} ${"Tokens".padStart(12)}`,
    ),
  );
  console.log(
    chalk.dim(
      `  ${"─".repeat(12)} ${"─".repeat(8)} ${"─".repeat(12)} ${"─".repeat(12)}`,
    ),
  );

  for (const day of summaries) {
    const costColor =
      day.totalCost > 10
        ? chalk.red
        : day.totalCost > 1
          ? chalk.yellow
          : chalk.white;
    const tokens = day.totalInputTokens + day.totalOutputTokens;
    console.log(
      `  ${day.date.padEnd(12)} ${String(day.totalCalls).padStart(8)} ${costColor(`$${day.totalCost.toFixed(4)}`.padStart(12))} ${tokens.toLocaleString().padStart(12)}`,
    );
  }

  console.log();

  // Model breakdown (aggregated)
  const allModels: Record<
    string,
    { calls: number; cost: number; tokens: number }
  > = {};
  for (const day of summaries) {
    for (const [model, stats] of Object.entries(day.byModel)) {
      if (!allModels[model])
        allModels[model] = { calls: 0, cost: 0, tokens: 0 };
      allModels[model].calls += stats.calls;
      allModels[model].cost += stats.cost;
      allModels[model].tokens += stats.tokens;
    }
  }

  console.log(chalk.dim("  By model:"));
  const sorted = Object.entries(allModels).sort(
    (a, b) => b[1].cost - a[1].cost,
  );
  for (const [model, stats] of sorted) {
    console.log(
      `    ${model.padEnd(32)} $${stats.cost.toFixed(4).padStart(10)}  (${stats.calls} calls)`,
    );
  }

  console.log();
}
