# agentmoney — Quickstart

Know what your AI costs. A Node CLI that prices Claude / OpenAI / Gemini API calls.

## Install & run (end users)

```bash
# no install: run it straight from GitHub
npx -y -p github:naman10parikh/agentmoney agentmoney demo

# or keep a copy: clone, build, and put the commands on your PATH
git clone https://github.com/naman10parikh/agentmoney && cd agentmoney
npm install && npm install -g .
agentmoney demo                # price 8 sample calls and see the cost breakdown
```

## Build & run from source (contributors)

```bash
npm install                    # install deps
npm run build                  # tsc → dist/
npm test                       # vitest run (40 tests)
npm run eval                   # surfaces + 13 golden tasks, offline, pass^3
node dist/index.js --help      # run the CLI from the built output
# dev mode, no build step:
npm run dev -- demo            # runs src/index.ts via tsx
```

## The five things it does

```bash
agentmoney calc -m claude-sonnet-4-6 -i 5000 -o 1000           # price one call
agentmoney estimate -m claude-sonnet-4-6 -c 50 --avg-input 3000 --avg-output 800  # price a session
agentmoney models                                              # list all model pricing
agentmoney proxy --port 8999 --alert 5.00                      # live proxy + dashboard at /dashboard
agentmoney usage --days 30                                     # real usage from the Anthropic Usage API (Admin API key)
```

## Where things live

- Product source: `src/` (CLI entry is `src/index.ts`). See `AGENTS.md` for the full directory map.
- Reports are written to `.agentmoney/` (calls.jsonl + daily JSON/Markdown reports).
- Instructions for coding agents: `AGENTS.md` (Claude Code also reads `CLAUDE.md`).
