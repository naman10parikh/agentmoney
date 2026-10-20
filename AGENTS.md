# AGENTS.md: agentmoney

> The one set of instructions for every coding agent (Codex, Cursor, OpenCode, Copilot, Gemini CLI, Claude Code) and
> for the people steering them. `CLAUDE.md` and `GEMINI.md` import this file.

## What it does

agentmoney tells you what your AI costs. It prices one call or a whole session from a cited rate table for Claude,
OpenAI and Gemini models, runs a local proxy that records the real token usage of every call your app makes, reads
the Anthropic Usage API for what was actually spent, and writes daily JSON and Markdown reports to `.agentmoney/`.
Its agent employee is **Ledger** ([identity/SOUL.md](identity/SOUL.md)), whose job is **observability**: every
token, every cent.

## Tools and how to call them

**Command line** (`agentmoney`, TypeScript, built to `dist/index.js`):

| Command | What it does |
| --- | --- |
| `agentmoney calc -m <model> -i <in> -o <out> [--cache-read n] [--cache-write n] [--json]` | price one call; no network |
| `agentmoney estimate -m <model> -c <calls> [--avg-input n] [--avg-output n]` | price a session of similar calls |
| `agentmoney models [--json]` | every model in the rate table, with its rates per million tokens |
| `agentmoney proxy [--port 8999] [--target url] [--alert usd]` | a local proxy that records each call's tokens and cost, with a dashboard |
| `agentmoney usage [--days 7] [--json]` | real usage from the Anthropic Usage API (needs an Admin API key in `ANTHROPIC_ADMIN_KEY`) |
| `agentmoney demo` | prices 8 sample calls and writes a report |
| `agentmoney sandbox-run [--file calls.json] [--json]` | price an untrusted call log inside an E2B microVM (needs `E2B_API_KEY`) |
| `agentmoney memory-search "<query>" [--json]` | BM25 search over the memory and docs of the folder you run it in |
| `agentmoney --help` · `agentmoney --version` | help and version |

The proxy appends every call to `.agentmoney/calls.jsonl`; `demo` and the proxy write
`.agentmoney/report-YYYY-MM-DD.json` and `.md` in the folder they run in.

**MCP server** (`agentmoney-mcp`, stdio, 1 tool): `cost_query` prices one call (model, input and output tokens,
optional cache tokens) and returns the cost breakdown as JSON. Start it with
`npx -y -p github:naman10parikh/agentmoney agentmoney-mcp`.

**Skills** ([skills/](skills/)): `cost-investigation` explains a bill; `add-model-pricing` adds or changes a rate in
all three places it lives; `isolate-untrusted-pricing` prices a call log you did not write inside a sandbox.

**Sub-agents** ([.claude/agents/](.claude/agents/)): `cost-analyst` explains where spend went; `pricing-curator`
checks the rate table against the providers' pages and proposes edits.

**Hook** ([hooks/hooks.json](hooks/hooks.json)): at session start, if the project has `.agentmoney/calls.jsonl`, the
agent is told the total spend, today's spend and the top models. Silent otherwise.

## How it prices

- Rates are USD per million tokens in `src/pricing.ts` (as of March 2026), for input, output, cache reads and cache
  writes. A model with no published cache rate is charged its input rate for cache tokens.
- Model names match exactly first, then by prefix (a date suffix such as `-20260301`), then by containment (a
  provider prefix such as `anthropic/`), longest name first.
- An unknown model is estimated at $3 in and $15 out per million tokens, and never raises an error.
- `usage` prices the Usage API's tokens with the same engine. A one-hour cache write costs twice the input rate;
  web search and code execution charges are not included.

## What not to do

- Never change a rate in `src/pricing.ts` without the README table and a test case in the same commit
  (`skills/add-model-pricing`); `pnpm eval` fails when a priced model is missing from the README.
- Never send a normal API key to the Usage API, and never print or log a key: the proxy forwards real credentials.
- Never let `pnpm eval` or a test call a real API: the Usage API eval uses `eval/stub-usage.mjs`.
- Never parse a call log you did not write on the host when isolation matters: use `sandbox-run`.
- Never commit a key, a home path or a report (`.agentmoney/` is ignored).
- Never merge a change that fails `pnpm test` or `pnpm eval`.

## Directory map (what lives where)

```
src/                  # The product: a Node CLI (TypeScript, ESM)
  index.ts            #   commander CLI entry: calc, estimate, models, proxy, usage, demo, sandbox-run, memory-search
  pricing.ts          #   the rate table (Claude, OpenAI, Gemini) and fuzzy model matching
  tracker.ts          #   accumulates spend per model, provider and session; session alerts
  proxy.ts            #   Express proxy that reads each response's usage block, streamed replies included
  dashboard.ts        #   the proxy's web dashboard (Chart.js from a CDN: the charts need the internet)
  reporter.ts         #   terminal dashboard and summary
  logger.ts           #   writes calls.jsonl and the daily JSON and Markdown reports to .agentmoney/
  anthropic-usage.ts  #   reads the Anthropic Usage API and prices it
  mcp-server.ts       #   the MCP server (cost_query), plain JSON-RPC over stdio
  sandbox-runner.ts   #   boots an E2B microVM and prices a call log inside it
  sandbox-pricer.ts   #   builds the self-contained program the sandbox runs, from the host rate table
  memory-search.ts    #   BM25 index over brain/, memory/, docs/ and the root docs
  types.ts            #   shared types
test/                 # vitest suites (pricing, tracker, proxy, usage, sandbox pricer, memory search)
eval/                 # surfaces.py, golden.sh, stub-usage.mjs, run.sh (`pnpm eval`)
skills/               # the three skills (also loaded by the Claude Code plugin)
hooks/                # the plugin's SessionStart hook
identity/             # SOUL, BRAND, HEARTBEAT, MEMORY: who Ledger is
memory/               # MEMORY.md index, LEARNINGS.md, topics/, daily/, archive/
brain/                # Obsidian-style navigation graph (start at brain/MOC - agentmoney.md)
scripts/              # improve.mjs (the nightly loop), cost-watch.mjs (the budget gate), inherited ops scripts
.claude/              # settings and hooks, sub-agents, rules, commands, inherited skills
.claude-plugin/       # plugin.json and marketplace.json
.github/workflows/    # ci.yml, improve.yml, cost-watch.yml
dist/                 # tsc output (ignored; built on install by `prepare`)
.agentmoney/          # run output: calls.jsonl, daily reports, eval results (ignored)
```

## Sub-agents (in `.claude/agents/`)

Use these for research and review; the parent agent does the writing.

| Sub-agent | Use for |
| --- | --- |
| `cost-analyst` | explain a bill: which model and session drove it, and what caching saved |
| `pricing-curator` | check the rate table against the providers' pages and propose cited edits |
| `architect` | design trade-offs (for example, how to add a new provider) |
| `code-reviewer` | review a diff before commit |
| `test-writer` | generate vitest cases for new pricing or tracker logic |
| `security-reviewer` | audit the proxy path (it forwards real API keys) |
| `performance-analyzer` | check hot paths (per-call pricing, proxy throughput) |
| `research-agent` | look up current model pricing from provider docs |
| `loop-auditor` | audit the agent harness scaffold for quality |

## How to work here

1. Read `CLAUDE.md` and this file first.
2. Build and check: `pnpm install && pnpm build && pnpm test && pnpm eval`.
3. Test as a user: run `node dist/index.js demo` and read the cost breakdown; "it compiles" is not enough.
4. Update model rates in `src/pricing.ts` and the README pricing tables together; they must agree.
5. When you fix an error, add it to `memory/LEARNINGS.md` as what broke, the root cause and the rule.

## Commit convention

Conventional commits. Scope by what changed so history is easy to search and revert:

- `feat(pricing): add DeepSeek model rates`
- `feat(cli): add --csv export to estimate`
- `fix(proxy): handle streaming responses without a usage block`
- `docs:` for documentation-only changes
- `test(tracker): cover multi-session aggregation`
- `chore(deps):` / `ci:` for tooling

## Quality bar

- TypeScript strict, no `any`, named exports only, files under 400 lines.
- Every supported model in `pricing.ts` must also appear in the README pricing tables (`eval/surfaces.py` checks it).
- New commands need a row in the README command table and a test.
- Pricing is a public claim: cite the provider and the date when you update a rate.
