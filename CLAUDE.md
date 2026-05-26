# agentmoney — Agent-Native Harness

> A recursively self-improving, agent-native harness built on the Energy harness formula.
> One repo = one self-contained agent flavor. Energy is the control center; this is a standalone flavor.

## What this is

agentmoney tracks what your AI agents actually spend. It is a real-time cost monitor for
Claude, OpenAI, and other LLM APIs — a local proxy + tracker + dashboard + reporter that
captures every token, prices it against current model rates, and tells you exactly where the
money goes. CLI-first, zero-config, MIT-licensed.

Core surfaces (in `src/`):

- `proxy.ts` — drop-in API proxy that records every request/response.
- `tracker.ts` — accumulates spend per model/agent/run.
- `pricing.ts` — current per-token rates for Claude/OpenAI/etc.
- `dashboard.ts` — live local dashboard (Express).
- `reporter.ts` — writes daily JSON + Markdown reports to `.agentmoney/`.
- `anthropic-usage.ts` — pulls real usage from the Anthropic console.
- `index.ts` — the `agentmoney` CLI entry point (commander).

## Harness components (the formula)

identity/ · memory/ + brain/ · skills/ + .claude/skills · hooks/ + .claude/hooks ·
.claude/agents (subagents) · .mcp.json (plugins/MCP) · eval/ (eval + observer).
Same formula as every Energy harness, different data. This is a CLI, so there is no
src/frontend|backend|db|auth — the product lives in `src/` as a Node CLI.

## Operating model

You are a co-founder, not an assistant. Act, don't ask. Self-improve every session.
Test as a user — "it compiles" means nothing; run the CLI and read the output.
Inherited rules in `.claude/rules/` are glob-loaded every session.

## Build & test

- `npm install` — install deps.
- `npm run build` — `tsc` to `dist/`.
- `npm test` — `vitest run`.
- `npx agentmoney --help` / `npx agentmoney demo` — run the CLI.

## Commit convention

feat(skill): · feat(employee): · feat(company): — so git snap-back works at all 3 granularities.
