import chalk from "chalk";
import { calculateCost } from "./pricing.js";

// The Anthropic Usage API: GET /v1/organizations/usage_report/messages, read with an Admin API key.
// Docs: https://platform.claude.com/docs/en/api/beta/organization/usage_report/retrieve_messages
interface UsageReportRow {
  model: string | null;
  uncached_input_tokens?: number;
  cache_creation?: {
    ephemeral_5m_input_tokens?: number;
    ephemeral_1h_input_tokens?: number;
  };
  cache_read_input_tokens?: number;
  output_tokens?: number;
}

interface UsageReportPage {
  data?: Array<{ starting_at: string; ending_at: string; results?: UsageReportRow[] }>;
  has_more?: boolean;
  next_page?: string | null;
}

export interface UsageSummary {
  date: string;
  totalCost: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheReadTokens: number;
  totalCacheWriteTokens: number;
  byModel: Record<string, { cost: number; tokens: number }>;
}

const DAY_MS = 86_400_000;

/** The key the Usage API accepts: an Admin API key (sk-ant-admin...). Workspace API keys cannot read usage. */
export function adminKeyFromEnv(env: NodeJS.ProcessEnv = process.env): string | undefined {
  if (env.ANTHROPIC_ADMIN_KEY) return env.ANTHROPIC_ADMIN_KEY;
  // Older setups put the admin key in ANTHROPIC_API_KEY; send it only when it is an admin key.
  const legacy = env.ANTHROPIC_API_KEY;
  return legacy?.startsWith("sk-ant-admin") ? legacy : undefined;
}

function priceRow(summary: UsageSummary, row: UsageReportRow): void {
  const model = row.model ?? "unknown";
  const input = row.uncached_input_tokens ?? 0;
  const output = row.output_tokens ?? 0;
  const cacheRead = row.cache_read_input_tokens ?? 0;
  const write5m = row.cache_creation?.ephemeral_5m_input_tokens ?? 0;
  const write1h = row.cache_creation?.ephemeral_1h_input_tokens ?? 0;
  // The engine's cache-write rate is the five-minute one; a one-hour cache write costs twice the input rate.
  const cost =
    calculateCost(model, input, output, cacheRead, write5m).totalCost +
    calculateCost(model, write1h * 2, 0).inputCost;
  const tokens = input + output + cacheRead + write5m + write1h;

  summary.totalCost += cost;
  summary.totalInputTokens += input;
  summary.totalOutputTokens += output;
  summary.totalCacheReadTokens += cacheRead;
  summary.totalCacheWriteTokens += write5m + write1h;
  const entry = summary.byModel[model] ?? { cost: 0, tokens: 0 };
  entry.cost += cost;
  entry.tokens += tokens;
  summary.byModel[model] = entry;
}

/**
 * Daily token usage per model for the last `days` days (today included), priced with the same engine as `calc`.
 * Set ANTHROPIC_BASE_URL to read from another host (the evals use a stand-in).
 */
export async function fetchAnthropicUsage(
  adminKey: string,
  days: number,
): Promise<UsageSummary[]> {
  const base = (process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com").replace(/\/+$/, "");
  const today = Date.parse(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
  const startingAt = new Date(today - (days - 1) * DAY_MS).toISOString();
  const endingAt = new Date(today + DAY_MS).toISOString(); // a bucket is returned when it ends by this time

  const byDate = new Map<string, UsageSummary>();
  let page: string | null | undefined = null;
  do {
    const query =
      `starting_at=${encodeURIComponent(startingAt)}&ending_at=${encodeURIComponent(endingAt)}` +
      `&bucket_width=1d&limit=31&group_by[]=model` +
      (page ? `&page=${encodeURIComponent(page)}` : "");
    const response = await fetch(`${base}/v1/organizations/usage_report/messages?${query}`, {
      headers: {
        "x-api-key": adminKey,
        "anthropic-version": "2023-06-01",
        "user-agent": "agentmoney/1.0.0 (https://github.com/naman10parikh/agentmoney)",
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error("The Usage API rejected the key (401). Check ANTHROPIC_ADMIN_KEY.");
      }
      if (response.status === 403) {
        throw new Error(
          "This key cannot read usage (403). The Usage API needs an Admin API key (sk-ant-admin...); " +
            "workspace API keys do not work.",
        );
      }
      throw new Error(`Anthropic API returned ${response.status}: ${await response.text()}`);
    }

    const body = (await response.json()) as UsageReportPage;
    for (const bucket of body.data ?? []) {
      const rows = bucket.results ?? [];
      if (rows.length === 0) continue;
      const date = bucket.starting_at.slice(0, 10);
      const summary = byDate.get(date) ?? {
        date,
        totalCost: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalCacheReadTokens: 0,
        totalCacheWriteTokens: 0,
        byModel: {},
      };
      for (const row of rows) priceRow(summary, row);
      byDate.set(date, summary);
    }
    page = body.has_more ? body.next_page : null;
  } while (page);

  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function totalTokens(s: UsageSummary): number {
  return s.totalInputTokens + s.totalOutputTokens + s.totalCacheReadTokens + s.totalCacheWriteTokens;
}

export function printUsageReport(summaries: UsageSummary[]): void {
  if (summaries.length === 0) {
    console.log(chalk.yellow("\n  No usage data found for this period.\n"));
    return;
  }

  const grandTotal = summaries.reduce((sum, s) => sum + s.totalCost, 0);
  const grandTokens = summaries.reduce((sum, s) => sum + totalTokens(s), 0);

  console.log();
  console.log(
    chalk.cyan.bold("agentmoney usage") + chalk.dim(" — Anthropic API"),
  );
  console.log(chalk.dim("─".repeat(60)));
  console.log();
  console.log(
    `  Period:       ${summaries[0].date} → ${summaries[summaries.length - 1].date}`,
  );
  console.log(`  Total cost:   ${chalk.bold(`$${grandTotal.toFixed(4)}`)}`);
  console.log(`  Total tokens: ${grandTokens.toLocaleString()}`);
  console.log();

  // Daily breakdown
  console.log(
    chalk.dim(`  ${"Date".padEnd(12)} ${"Cost".padStart(12)} ${"Tokens".padStart(14)}`),
  );
  console.log(
    chalk.dim(`  ${"─".repeat(12)} ${"─".repeat(12)} ${"─".repeat(14)}`),
  );

  for (const day of summaries) {
    const costColor =
      day.totalCost > 10
        ? chalk.red
        : day.totalCost > 1
          ? chalk.yellow
          : chalk.white;
    console.log(
      `  ${day.date.padEnd(12)} ${costColor(`$${day.totalCost.toFixed(4)}`.padStart(12))} ${totalTokens(day).toLocaleString().padStart(14)}`,
    );
  }

  console.log();

  // Model breakdown (aggregated)
  const allModels: Record<string, { cost: number; tokens: number }> = {};
  for (const day of summaries) {
    for (const [model, stats] of Object.entries(day.byModel)) {
      if (!allModels[model]) allModels[model] = { cost: 0, tokens: 0 };
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
      `    ${model.padEnd(32)} $${stats.cost.toFixed(4).padStart(10)}  (${stats.tokens.toLocaleString()} tokens)`,
    );
  }

  console.log();
}
