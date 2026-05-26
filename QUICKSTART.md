# agentmoney — Quickstart

Know what your AI costs. A Node CLI that prices Claude / OpenAI / Gemini API calls.

## Install & run (end users)

```bash
npm install -g agentmoney      # install globally
agentmoney demo                # simulate 8 calls and see the cost breakdown
# or, no install:
npx agentmoney demo
```

## Build & run from source (contributors)

```bash
npm install                    # install deps
npm run build                  # tsc → dist/
npm test                       # vitest run (25 tests)
npx agentmoney --help          # run the CLI from the built output
# dev mode, no build step:
npm run dev -- demo            # runs src/index.ts via tsx
```

## The five things it does

```bash
agentmoney calc -m claude-sonnet-4-6 -i 5000 -o 1000           # price one call
agentmoney estimate -m claude-sonnet-4-6 -c 50 --avg-input 3000 --avg-output 800  # price a session
agentmoney models                                              # list all model pricing
agentmoney proxy --port 8999 --alert 5.00                      # live proxy + dashboard at /dashboard
agentmoney usage --days 30                                     # pull real spend from Anthropic
```

## Where things live

- Product source: `src/` (CLI entry is `src/index.ts`). See [[MOC - agentmoney]] / `AGENTS.md` for the full directory map.
- Reports are written to `.agentmoney/` (calls.jsonl + daily JSON/Markdown reports).
- Operating brief for AI agents: `CLAUDE.md`. Current state: `CONTEXT.md`.
