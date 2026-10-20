---
name: cost-investigation
description: Use when someone asks "why was my API bill so high?", "which session burned the budget?", "did prompt caching help?", or "where did the money go?" — agentmoney's core promise. Walks the proxy logs, the Anthropic usage API, and the repo's own memory to attribute spend to a model/session and quantify cache savings.
---

## Trigger

An unexpected or unexplained LLM bill. The user ran agents overnight, woke up to a
charge, and needs the dollars attributed — model, session, and whether caching paid off.

## Why this is a skill

This is literally the README's opening pitch ("Your API bill is $247. You have no
idea which session burned it..."). The investigation has a fixed, repeatable order;
encoding it stops every cost post-mortem from being improvised.

## Steps

1. **Get ground truth from the provider.** Run `node dist/index.js usage --days 30 --json`
   to pull real spend from the Anthropic usage API. This is the number the bill is
   based on — start from reality, not from estimates.
2. **Attribute via the proxy logs.** Read `.agentmoney/calls.jsonl` and the daily
   `report-YYYY-MM-DD.{json,md}` files. Group spend by model and by session to find
   the single biggest contributor. If no proxy data exists, tell the user to route
   traffic through `agentmoney proxy --port 8999` going forward so the next bill is
   attributable.
3. **Quantify cache savings.** For the top sessions, compare `cacheReadTokens` vs raw
   input tokens. Use `node dist/index.js calc -m <model> -i <in> -o <out> --cache-read <cr>`
   to compute the with-cache cost, then again with `--cache-read 0`, and report the
   delta as the realized (or missed) savings.
4. **Recall prior incidents.** Run `node dist/index.js memory-search "cost spike caching session"`
   to surface any past LEARNINGS about the same failure mode before re-deriving it.
5. **Recommend a guardrail.** If the spike is repeatable, recommend a budget alert:
   `agentmoney proxy --alert <usd>` so the proxy warns at a configurable cap.

## Verify

- The attributed per-model total reconciles with the `usage` total within rounding.
- The cache-savings figure is shown both as a dollar amount and a percentage.
- A concrete next-step guardrail (proxy alert threshold) is named.

## Output

A short attribution report: total spend, the #1 model/session that drove it, the
realized vs missed cache savings in dollars, and one guardrail to set. No new files —
read the logs, run the CLI, summarize.
