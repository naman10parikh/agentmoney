#!/usr/bin/env node

import { Command } from "commander";
import chalk from "chalk";
import { CostTracker } from "./tracker.js";
import { createProxy } from "./proxy.js";
import { printDashboard, printSummary, printJson } from "./reporter.js";
import { logCall, writeReport, writeMarkdownReport } from "./logger.js";
import { calculateCost, detectProvider, listModels } from "./pricing.js";
import { fetchAnthropicUsage, printUsageReport } from "./anthropic-usage.js";

const program = new Command();

program
  .name("agentmoney")
  .description("Track what your AI agents actually spend.")
  .version("1.0.0");

// Proxy mode: intercept API calls
program
  .command("proxy")
  .description("Start a local proxy that intercepts and tracks API calls")
  .option("-p, --port <port>", "Proxy port", "8999")
  .option("-t, --target <url>", "Target API URL", "https://api.anthropic.com")
  .option(
    "--alert <amount>",
    "Alert when session cost exceeds this (USD)",
    parseFloat,
  )
  .action(async (opts) => {
    const alerts = opts.alert
      ? [
          {
            type: "session" as const,
            threshold: opts.alert,
            action: "warn" as const,
          },
        ]
      : [];
    const tracker = new CostTracker(alerts);
    tracker.startSession();

    const app = createProxy(tracker, opts.target, parseInt(opts.port));

    // Log every call
    const origRecord = tracker.recordCall.bind(tracker);
    tracker.recordCall = (params) => {
      const call = origRecord(params);
      logCall(call);
      return call;
    };

    app.listen(parseInt(opts.port), () => {
      console.log();
      console.log(chalk.cyan.bold("agentmoney proxy") + chalk.dim(" running"));
      console.log();
      console.log(
        `  Proxy:     ${chalk.green(`http://localhost:${opts.port}`)}`,
      );
      console.log(`  Target:    ${chalk.dim(opts.target)}`);
      console.log(
        `  Dashboard: ${chalk.green(`http://localhost:${opts.port}/dashboard`)}`,
      );
      console.log(
        `  API:       ${chalk.green(`http://localhost:${opts.port}/costs`)}`,
      );
      if (opts.alert) {
        console.log(
          `  Alert:     ${chalk.yellow(`$${opts.alert} per session`)}`,
        );
      }
      console.log();
      console.log(chalk.dim("  Set your API base URL to the proxy:"));
      console.log(
        chalk.dim(`  ANTHROPIC_BASE_URL=http://localhost:${opts.port}`),
      );
      console.log();

      // Live dashboard update every 5 seconds
      setInterval(() => printDashboard(tracker), 5000);
    });

    // Graceful shutdown
    const shutdown = () => {
      console.log();
      printSummary(tracker);
      const jsonPath = writeReport(tracker);
      const mdPath = writeMarkdownReport(tracker);
      console.log(chalk.dim(`Reports: ${jsonPath}, ${mdPath}`));
      process.exit(0);
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  });

// Calculate cost for a single API call
program
  .command("calc")
  .description("Calculate cost for a single API call")
  .requiredOption("-m, --model <model>", "Model name (e.g., claude-sonnet-4-6)")
  .requiredOption("-i, --input <tokens>", "Input tokens", parseInt)
  .requiredOption("-o, --output <tokens>", "Output tokens", parseInt)
  .option("--cache-read <tokens>", "Cache read tokens", parseInt, 0)
  .option("--cache-write <tokens>", "Cache write tokens", parseInt, 0)
  .option("--json", "Output as JSON", false)
  .action((opts) => {
    const costs = calculateCost(
      opts.model,
      opts.input,
      opts.output,
      opts.cacheRead,
      opts.cacheWrite,
    );

    if (opts.json) {
      console.log(
        JSON.stringify({ model: opts.model, ...opts, ...costs }, null, 2),
      );
      return;
    }

    console.log();
    console.log(chalk.cyan.bold("agentmoney calc"));
    console.log();
    console.log(`  Model:      ${opts.model} (${detectProvider(opts.model)})`);
    console.log(
      `  Input:      ${opts.input.toLocaleString()} tokens → $${costs.inputCost.toFixed(6)}`,
    );
    console.log(
      `  Output:     ${opts.output.toLocaleString()} tokens → $${costs.outputCost.toFixed(6)}`,
    );
    if (opts.cacheRead > 0 || opts.cacheWrite > 0) {
      console.log(`  Cache:      $${costs.cacheCost.toFixed(6)}`);
    }
    console.log(
      `  ${chalk.bold(`Total:      $${costs.totalCost.toFixed(6)}`)}`,
    );
    console.log();
  });

// Estimate cost for a session
program
  .command("estimate")
  .description("Estimate cost for a session (calls * avg tokens)")
  .requiredOption("-m, --model <model>", "Model name")
  .requiredOption("-c, --calls <n>", "Number of API calls", parseInt)
  .option("--avg-input <tokens>", "Avg input tokens per call", parseInt, 2000)
  .option("--avg-output <tokens>", "Avg output tokens per call", parseInt, 500)
  .action((opts) => {
    const perCall = calculateCost(opts.model, opts.avgInput, opts.avgOutput);
    const total = perCall.totalCost * opts.calls;

    console.log();
    console.log(chalk.cyan.bold("agentmoney estimate"));
    console.log();
    console.log(`  Model:      ${opts.model}`);
    console.log(`  Calls:      ${opts.calls}`);
    console.log(
      `  Per call:   $${perCall.totalCost.toFixed(6)} (${opts.avgInput} in / ${opts.avgOutput} out)`,
    );
    console.log(`  ${chalk.bold(`Estimated:  $${total.toFixed(4)}`)}`);
    console.log();
  });

// List supported models and pricing
program
  .command("models")
  .description("List supported models and their pricing")
  .option("--json", "Output as JSON", false)
  .action((opts) => {
    const models = listModels();

    if (opts.json) {
      const data = models.map((m) => {
        const cost = calculateCost(m, 1_000_000, 1_000_000);
        return {
          model: m,
          provider: detectProvider(m),
          inputPer1M: cost.inputCost,
          outputPer1M: cost.outputCost,
        };
      });
      console.log(JSON.stringify(data, null, 2));
      return;
    }

    console.log();
    console.log(chalk.cyan.bold("Supported models"));
    console.log();
    console.log(
      `  ${"Model".padEnd(35)} ${"Input/1M".padStart(10)} ${"Output/1M".padStart(10)}`,
    );
    console.log(
      chalk.dim(`  ${"─".repeat(35)} ${"─".repeat(10)} ${"─".repeat(10)}`),
    );

    for (const model of models) {
      const cost = calculateCost(model, 1_000_000, 1_000_000);
      const provider = detectProvider(model);
      const color =
        provider === "anthropic"
          ? chalk.yellow
          : provider === "openai"
            ? chalk.green
            : chalk.blue;
      console.log(
        `  ${color(model.padEnd(35))} $${cost.inputCost.toFixed(2).padStart(9)} $${cost.outputCost.toFixed(2).padStart(9)}`,
      );
    }

    console.log();
  });

// Demo mode: simulate API calls to test the tracker
program
  .command("demo")
  .description("Run a demo simulation to see how tracking works")
  .action(async () => {
    const tracker = new CostTracker([
      { type: "session", threshold: 0.05, action: "warn" },
    ]);
    tracker.startSession("demo");

    console.log(chalk.cyan.bold("\nagentmoney demo\n"));
    console.log(chalk.dim("Simulating 8 API calls...\n"));

    const calls = [
      { model: "claude-sonnet-4-6", inputTokens: 3200, outputTokens: 800 },
      { model: "claude-sonnet-4-6", inputTokens: 5100, outputTokens: 1200 },
      {
        model: "claude-haiku-4-5",
        inputTokens: 1500,
        outputTokens: 400,
      },
      { model: "claude-sonnet-4-6", inputTokens: 8000, outputTokens: 2500 },
      { model: "claude-opus-4-6", inputTokens: 4000, outputTokens: 1800 },
      { model: "gpt-4o", inputTokens: 2000, outputTokens: 600 },
      {
        model: "claude-sonnet-4-6",
        inputTokens: 12000,
        outputTokens: 3000,
        cacheReadTokens: 8000,
      },
      {
        model: "claude-haiku-4-5",
        inputTokens: 900,
        outputTokens: 200,
      },
    ];

    for (const call of calls) {
      tracker.recordCall({
        ...call,
        cacheReadTokens: call.cacheReadTokens ?? 0,
        durationMs: Math.floor(Math.random() * 3000) + 500,
      });
      await new Promise((r) => setTimeout(r, 300));
      process.stdout.write(chalk.green("."));
    }

    console.log("\n");
    printSummary(tracker);

    const jsonPath = writeReport(tracker);
    const mdPath = writeMarkdownReport(tracker);
    console.log(chalk.dim(`Reports saved: ${jsonPath}, ${mdPath}`));
    console.log();
  });

// Fetch actual usage from Anthropic API
program
  .command("usage")
  .description("Fetch real usage data from the Anthropic API")
  .option("-d, --days <n>", "Number of days to fetch", parseInt, 7)
  .option("--json", "Output as JSON", false)
  .action(async (opts) => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.error(chalk.red("\n  Error: ANTHROPIC_API_KEY is not set.\n"));
      process.exit(1);
    }

    try {
      const summaries = await fetchAnthropicUsage(apiKey, opts.days);

      if (opts.json) {
        console.log(JSON.stringify(summaries, null, 2));
      } else {
        printUsageReport(summaries);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(chalk.red(`\n  Error: ${msg}\n`));
      process.exit(1);
    }
  });

// Default action: show status overview when no subcommand given
program.action(() => {
  console.log();
  console.log(chalk.cyan.bold("  agentmoney") + chalk.dim(" v1.0.0"));
  console.log(chalk.dim("  Stop guessing what AI costs you.\n"));

  console.log(chalk.white("  Commands:"));
  console.log(
    `    ${chalk.green("proxy")}      Start a cost-tracking proxy for live API monitoring`,
  );
  console.log(
    `    ${chalk.green("usage")}      Fetch real spending data from Anthropic API`,
  );
  console.log(
    `    ${chalk.green("calc")}       Calculate cost for a single API call`,
  );
  console.log(`    ${chalk.green("estimate")}   Estimate cost for a session`);
  console.log(
    `    ${chalk.green("models")}     List all supported models and pricing`,
  );
  console.log(`    ${chalk.green("demo")}       Run a demo simulation`);
  console.log();

  console.log(chalk.white("  Quick start:"));
  console.log(
    chalk.dim("    $ agentmoney proxy                     # Start the proxy"),
  );
  console.log(
    chalk.dim("    $ ANTHROPIC_BASE_URL=http://localhost:8999 your-app"),
  );
  console.log(
    chalk.dim(
      "    $ agentmoney usage                     # See real Anthropic spending",
    ),
  );
  console.log(
    chalk.dim("    $ agentmoney calc -m claude-sonnet-4-6 -i 5000 -o 1000"),
  );
  console.log();
});

program.parse();
