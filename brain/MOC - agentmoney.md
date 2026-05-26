---
type: moc
status: active
created: 2026-05-25
updated: 2026-05-26
tags: [agentmoney, moc]
source: README.md
related: ["[[ORG_CONTEXT]]", "[[ORG_MEMORY]]"]
---

# MOC — agentmoney

Master hub for this harness's brain. agentmoney is a TypeScript/ESM Node CLI that prices
LLM API calls (Claude / OpenAI / Gemini) — proxy, tracker, dashboard, reporter. Every doc and
every top-level folder is reachable from here.

## Doc spine (repo root)

- [[Doc - README]] — human/OSS front door (`README.md`): install, commands, pricing tables.
- [[Doc - CLAUDE]] — agent operating brief (`CLAUDE.md`): what-it-is, harness map, build/test, commits.
- [[Doc - CONTEXT]] — current session state (`CONTEXT.md`): product type, status, what's next.
- [[Doc - QUICKSTART]] — inline build + run commands (`QUICKSTART.md`).
- [[Doc - AGENTS]] — this repo's agent-orchestration conventions + directory map (`AGENTS.md`).
- `LICENSE` — MIT.

## Product (the CLI)

- [[Architecture - CLI]] — how `src/` is laid out and how a cost flows from call → price → report.
- Pricing engine: `src/pricing.ts` · Tracker: `src/tracker.ts` · Proxy: `src/proxy.ts` ·
  Dashboard: `src/dashboard.ts` · Reporter: `src/reporter.ts` · Anthropic usage: `src/anthropic-usage.ts`.

## Company Brain

- [[ORG_CONTEXT]] — what this company/agent is and its operating context.
- [[ORG_MEMORY]] — what the fleet has learned (write-back).

## Operations

- [[Ops - Harness]] — the inherited harness layer (`.claude/`, `scripts/`, `eval/`, `identity/`, `memory/`).

## Top-level folders (named, no orphans)

| Folder         | What it holds                                                            |
| -------------- | ------------------------------------------------------------------------ |
| `src/`         | The product — Node CLI source (TypeScript, ESM).                         |
| `test/`        | vitest suites (`pricing.test.ts`, `tracker.test.ts`).                   |
| `dist/`        | tsc build output (product of `npm run build`).                          |
| `.agentmoney/` | runtime report output (calls.jsonl + daily JSON/Markdown reports).       |
| `scripts/`     | inherited harness ops scripts (budget, memory, doc-health, auto-switch). |
| `eval/`        | eval + observer layer ([[Ops - Harness]]).                               |
| `identity/`    | agent identity quad: SOUL / MEMORY / HEARTBEAT / BRAND.                  |
| `memory/`      | long-term memory: MEMORY index, LEARNINGS, topics/, daily/, archive/.    |
| `brain/`       | this Obsidian navigation graph (MOC + ORG_CONTEXT + ORG_MEMORY).         |
| `.claude/`     | inherited harness: rules/, skills/, hooks/, commands/, agents/.          |
| `.github/`     | CI workflow (build + test).                                              |
