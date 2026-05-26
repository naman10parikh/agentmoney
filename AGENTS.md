# AGENTS.md — agentmoney Orchestration Conventions

> How an AI agent (Claude Code or any coding agent) should work inside this repo.
> agentmoney is a TypeScript/ESM Node CLI that prices LLM API calls. This file maps the
> repo's directories, names its sub-agents, and fixes the commit grammar. Co-evolve it over time.

## What this repo is

A real-time **LLM cost calculator + monitoring CLI** for Claude, OpenAI, and Gemini APIs.
It prices a single call (`calc`), estimates a session (`estimate`), proxies live traffic to
extract real token usage (`proxy`), pulls real spend from the Anthropic usage API (`usage`),
and writes daily JSON + Markdown reports to `.agentmoney/`. Pure-math pricing engine, no DB,
zero-config, MIT-licensed. See [[MOC - agentmoney]] for the full doc map.

## Directory map (what lives where)

```
src/                  # The product — Node CLI source (TypeScript, ESM)
  index.ts            #   commander CLI entry; defines calc/estimate/models/proxy/usage/demo
  pricing.ts          #   per-token rate tables (Claude/OpenAI/Gemini) + fuzzy model matching
  tracker.ts          #   accumulates spend per model/provider/session
  proxy.ts            #   Express proxy that intercepts API responses for live token usage
  dashboard.ts        #   live local web dashboard (Chart.js) served by the proxy
  reporter.ts         #   writes report-YYYY-MM-DD.{json,md} + calls.jsonl to .agentmoney/
  anthropic-usage.ts  #   fetches real spend from the Anthropic /v1/usage endpoint
  logger.ts           #   chalk-based console output helpers
  types.ts            #   shared TS types (CallRecord, ModelPricing, etc.)
test/                 # vitest suites (pricing.test.ts, tracker.test.ts)
dist/                 # tsc build output (gitignored product of `npm run build`)
.agentmoney/          # runtime report output dir (calls.jsonl, daily JSON + MD reports)
scripts/              # inherited harness ops scripts (budget, memory, doc-health, auto-switch)
eval/                 # eval + observer layer (seeded; see eval/README.md)
identity/             # agent identity quad: SOUL / MEMORY / HEARTBEAT / BRAND
memory/               # long-term memory: MEMORY.md index, LEARNINGS.md, topics/, daily/, archive/
brain/                # Obsidian-style navigation graph (MOC + ORG_CONTEXT + ORG_MEMORY)
.claude/              # inherited harness: rules/, skills/, hooks/, commands/, agents/
.github/              # CI workflow (build + test)
```

## Sub-agents (in `.claude/agents/`)

Use these for research/review only — the parent agent does all the writing.

| Sub-agent              | Use for                                                  |
| ---------------------- | -------------------------------------------------------- |
| `architect`            | design trade-offs (e.g. how to add a new provider)       |
| `code-reviewer`        | review a diff before commit                              |
| `test-writer`          | generate vitest cases for new pricing/tracker logic      |
| `security-reviewer`    | audit the proxy path (it forwards real API keys)         |
| `performance-analyzer` | check hot paths (per-call pricing, proxy throughput)     |
| `research-agent`       | look up current model pricing from provider docs         |
| `loop-auditor`         | audit the agent harness scaffold for quality             |

## How to work here

1. Read `CLAUDE.md` (operating brief) and `CONTEXT.md` (current state) first.
2. For any change to pricing, run `npm test` — `pricing.test.ts` is the canary.
3. Test as a user: `npx agentmoney demo` and read the cost breakdown; don't trust "it compiles".
4. Update model rates in `src/pricing.ts` and the README pricing tables together — they must agree.

## Commit convention

Conventional commits. Scope by what changed so history is grep-able and revertible:

- `feat(pricing): add DeepSeek model rates`
- `feat(cli): add --csv export to estimate`
- `fix(proxy): handle streaming responses without a usage block`
- `docs:` for documentation-only changes
- `test(tracker): cover multi-session aggregation`
- `chore(deps):` / `ci:` for tooling

## Quality bar

- TypeScript strict, no `any`, named exports only, files < 400 lines.
- Every supported model in `pricing.ts` must also appear in the README pricing tables.
- New commands need a row in the README command table + a vitest test.
- Pricing is a public claim — cite the provider and the date when you update a rate.
