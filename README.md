# agentmoney

<!-- fleet:header:start -->
[![CI](https://img.shields.io/github/actions/workflow/status/naman10parikh/agentmoney/ci.yml?branch=main&style=flat-square&label=ci)](https://github.com/naman10parikh/agentmoney/actions) [![License: MIT](https://img.shields.io/badge/license-MIT-green?style=flat-square)](LICENSE) [![Agent-native](https://img.shields.io/badge/agent--native-yes-2f5d8a?style=flat-square)](AGENTS.md) [![MCP server](https://img.shields.io/badge/MCP-server-1e3f60?style=flat-square)](#use-it-from-any-coding-agent) [![Skills](https://img.shields.io/badge/skills-3-2f6b4f?style=flat-square)](skills/) [![Stars](https://img.shields.io/github/stars/naman10parikh/agentmoney?style=flat-square)](https://github.com/naman10parikh/agentmoney/stargazers)

**Know what your AI costs: pricing and spend for Claude, GPT and Gemini.**

AgentMoney is an agent employee, a packaged specialist agent with its own skills, memory and tests. It owns one job: observability. Its persona is Ledger. Coding agents use it through its skills, its MCP server and its command line. A scheduled job runs its evals and proposes fixes. A person makes every change.

_AgentMoney is part of an agent-native play for agent-native systems that can eventually be recursively self-improving and evolving, operated by agent employees._

[AGENTS.md](AGENTS.md) · [llms.txt](llms.txt) · [Skills](skills/) · [Security](SECURITY.md) · [Contributing](CONTRIBUTING.md) · [All projects](https://github.com/naman10parikh)
<!-- fleet:header:end -->

agentmoney tells you what your AI costs. It prices one call, a session, or every call your app makes, from a cited
rate table of 28 Claude, OpenAI and Gemini models, and it reads the Anthropic Usage API for what you actually spent.
It is for anyone who runs agents or LLM apps: you run Claude Code overnight, the bill is $247, and you want to know
which session burned it, which model, and whether prompt caching saved anything.

<!-- fleet:use:start -->
## Use it from any coding agent

**Claude Code**: the plugin brings the skills, sub-agents, hooks and MCP server.

```
/plugin marketplace add naman10parikh/agentmoney
/plugin install agentmoney@agentmoney
```

<details><summary>Its MCP server, Codex, Cursor, Gemini CLI, one skill and the command line</summary>

**Its MCP server**, in any MCP client:

```bash
claude mcp add --transport stdio agentmoney -- npx -y -p github:naman10parikh/agentmoney agentmoney-mcp
codex mcp add agentmoney -- npx -y -p github:naman10parikh/agentmoney agentmoney-mcp
```

Cursor (`.cursor/mcp.json`), Gemini CLI (`.gemini/settings.json`) and most other clients take the same command as JSON:

```json
{
  "mcpServers": {
    "agentmoney": {
      "command": "npx",
      "args": [
        "-y",
        "-p",
        "github:naman10parikh/agentmoney",
        "agentmoney-mcp"
      ]
    }
  }
}
```

**Gemini CLI**: the extension brings the context and the MCP server.

```bash
gemini extensions install https://github.com/naman10parikh/agentmoney
```

**One skill** (3 in all, in [skills/](skills/)), in any agent that reads Agent Skills:

```bash
gemini skills install https://github.com/naman10parikh/agentmoney --path skills/cost-investigation
git clone --depth 1 https://github.com/naman10parikh/agentmoney /tmp/agentmoney && cp -r /tmp/agentmoney/skills/cost-investigation ~/.claude/skills/
```

**The command line:**

```bash
npx -y -p github:naman10parikh/agentmoney agentmoney --help
```

</details>

Codex, Cursor, OpenCode, GitHub Copilot and other agents read [AGENTS.md](AGENTS.md); Claude Code reads [CLAUDE.md](CLAUDE.md) and Gemini CLI reads [GEMINI.md](GEMINI.md), which import it. [llms.txt](llms.txt) maps every surface for agents that read first.
<!-- fleet:use:end -->

## Quick start

You need Node 18 or newer (`sandbox-run` needs Node 20). `calc`, `estimate`, `models` and `demo` need nothing else
and never touch the network.

```bash
# Run it straight from GitHub, nothing installed: price 8 sample calls and see the breakdown
npx -y -p github:naman10parikh/agentmoney agentmoney demo

# Or keep a copy: clone, build, and put the commands on your PATH
git clone https://github.com/naman10parikh/agentmoney && cd agentmoney
npm install && npm install -g .
```

Price a call or a session:

```bash
agentmoney calc -m claude-sonnet-4-6 -i 5000 -o 1000                    # one call: $0.030000
agentmoney calc -m claude-sonnet-4-6 -i 5000 -o 1000 --cache-read 3000  # with prompt caching: $0.030900
agentmoney estimate -m claude-sonnet-4-6 -c 50 --avg-input 3000 --avg-output 800   # 50 calls: $1.0500
agentmoney models                                                       # every model and its rates
```

Track the calls your app really makes:

```bash
agentmoney proxy --port 8999 --alert 5.00        # warn when a session passes $5
ANTHROPIC_BASE_URL=http://localhost:8999 your-app
# live dashboard: http://localhost:8999/dashboard   cost JSON: http://localhost:8999/costs
```

Read what Anthropic recorded. This needs an Admin API key (it starts with `sk-ant-admin`); workspace API keys
cannot read usage.

```bash
export ANTHROPIC_ADMIN_KEY=...
agentmoney usage                    # the last 7 days, today included
agentmoney usage --days 30 --json
```

### Example output

`agentmoney demo` prices 8 sample calls with a $0.05 session alert, so it also shows the alert firing:

```
agentmoney demo

Simulating 8 API calls...

.[agentmoney] WARNING: Session cost $0.0549 exceeded $0.05 threshold
.[agentmoney] WARNING: Session cost $0.0584 exceeded $0.05 threshold
...
agentmoney summary
──────────────────────────────────────────────────

  Total cost:      $0.2812
  Total calls:     8
  Sessions:        1

  By provider:
    anthropic       $0.2702  (7 calls)
    openai          $0.0110  (1 calls)

  By model:
    claude-sonnet-4-6                 $0.1998  (4 calls, 35.8K tokens)
    claude-haiku-4-5                $0.005400  (2 calls, 3.0K tokens)
    claude-opus-4-6                   $0.0650  (1 calls, 5.8K tokens)
    gpt-4o                            $0.0110  (1 calls, 2.6K tokens)

  Session demo: $0.2812 (8 calls)

Reports saved: .agentmoney/report-YYYY-MM-DD.json, .agentmoney/report-YYYY-MM-DD.md
```

## How it works

| Mode | What happens |
| --- | --- |
| `calc`, `estimate`, `models` | Pure math: model and tokens in, cost out, from the rate table in `src/pricing.ts`. No network. |
| `proxy` | An Express server forwards every request to the target, reads the `usage` block of each JSON response (Anthropic's or OpenAI's, told apart by its fields), prices it, logs it and serves a dashboard. |
| `usage` | Reads `GET /v1/organizations/usage_report/messages` (daily, grouped by model, every page) and prices the tokens with the same engine. A one-hour cache write costs twice the input rate; web search and code execution charges are not included. |
| `sandbox-run` | Prices a call log you did not write inside an E2B microVM, with a program generated from the same rate table, and checks the total against the host. Needs `E2B_API_KEY`. |
| MCP `cost_query` | Any coding agent prices a call by asking the `agentmoney-mcp` server. |

### The proxy

```
Your app → agentmoney proxy (localhost:8999) → api.anthropic.com
                ↓
          cost tracking per model, provider and session
          web dashboard (Chart.js)
          .agentmoney/calls.jsonl
          daily reports
```

| Path | What it returns |
| --- | --- |
| `GET /dashboard` | the web dashboard: cost per session per day, the hourly trend and the split by model |
| `GET /health` | proxy status, total cost and call count (JSON) |
| `GET /costs` | the full breakdown by model, provider and session (JSON) |
| `* /*` | every other request, forwarded to the target |

`--alert <usd>` prints a warning each time a session's cost passes the threshold. Stop the proxy with Ctrl+C and it
prints a summary and writes the day's reports.

### Reports

agentmoney writes to `.agentmoney/` in the folder it runs in:

- `calls.jsonl`: every call the proxy saw, one JSON line each (model, tokens, cost, duration, endpoint, session)
- `report-YYYY-MM-DD.json`: the day's cost report as data
- `report-YYYY-MM-DD.md`: the same report in Markdown, ready to share

### Commands

| Command | What it does |
| --- | --- |
| `agentmoney` | show the commands and a quick start |
| `agentmoney demo` | price 8 sample calls and write a report |
| `agentmoney calc` | price one call |
| `agentmoney estimate` | price a session of similar calls |
| `agentmoney models` | list every model and its rates |
| `agentmoney proxy` | start the cost-tracking proxy and its dashboard |
| `agentmoney usage` | read real usage from the Anthropic Usage API |
| `agentmoney sandbox-run` | price an untrusted call log inside an E2B microVM |
| `agentmoney memory-search` | BM25 search over the memory and docs of the folder you run it in |

### Options and settings

| Flag or variable | Default | What it does |
| --- | --- | --- |
| `-m, --model <id>` | required | the model, for `calc` and `estimate` |
| `-i, --input` · `-o, --output` | required | input and output tokens, for `calc` |
| `--cache-read <n>` · `--cache-write <n>` | 0 | cache tokens, for `calc` |
| `-c, --calls <n>` · `--avg-input` · `--avg-output` | required, 2000, 500 | calls and tokens per call, for `estimate` |
| `--port <n>` | `8999` | the proxy's port |
| `--target <url>` | `https://api.anthropic.com` | where the proxy forwards requests |
| `--alert <usd>` | none | warn when a session's cost passes this |
| `--days <n>` | 7 | days to read, for `usage` |
| `--json` | off | JSON output (`calc`, `models`, `usage`, `sandbox-run`, `memory-search`) |
| `ANTHROPIC_ADMIN_KEY` | none | the Admin API key `usage` sends (an `sk-ant-admin` key in `ANTHROPIC_API_KEY` also works) |
| `ANTHROPIC_BASE_URL` | `https://api.anthropic.com` | where `usage` reads from |
| `E2B_API_KEY` | none | the key `sandbox-run` boots a microVM with |

### Tests and evals

```bash
npm install && npm run build
npm test          # vitest: pricing, tracker, the proxy round trip, the Usage API read, the sandbox program
npm run eval      # every surface, then 13 golden tasks against the built CLI, MCP server and hook, pass^3
```

No test or eval calls a real API: `eval/stub-usage.mjs` stands in for the Usage API. CI runs both on every push and
pull request. The most useful contributions are fresh rates (follow
[skills/add-model-pricing](skills/add-model-pricing/SKILL.md)), new providers such as Mistral, Cohere or DeepSeek,
historical trends and budget limits.

## Supported models and pricing

USD per million tokens, as of March 2026, from each provider's pricing page. Names match exactly, then by prefix
(a date suffix such as `claude-sonnet-4-6-20260301`), then by containment (a provider prefix such as
`anthropic/claude-sonnet-4-6`). An unknown model is estimated at $3 in and $15 out. Where a provider publishes no
cache rate (a dash below), cache tokens are charged at the input rate. `agentmoney models` prints the same table, and
the nightly loop flags the rates for a check when they are more than 90 days old.

### Anthropic

| Model | Input | Output | Cache read | Cache write |
| --- | --- | --- | --- | --- |
| claude-opus-4-6 | $5.00 | $25.00 | $0.50 | $6.25 |
| claude-sonnet-4-6 | $3.00 | $15.00 | $0.30 | $3.75 |
| claude-opus-4-5 | $5.00 | $25.00 | $0.50 | $6.25 |
| claude-sonnet-4-5 | $3.00 | $15.00 | $0.30 | $3.75 |
| claude-haiku-4-5 | $1.00 | $5.00 | $0.10 | $1.25 |
| claude-opus-4-1 | $15.00 | $75.00 | $1.50 | $18.75 |
| claude-opus-4 | $15.00 | $75.00 | $1.50 | $18.75 |
| claude-sonnet-4 | $3.00 | $15.00 | $0.30 | $3.75 |
| claude-3-5-sonnet | $3.00 | $15.00 | $0.30 | $3.75 |
| claude-3-5-haiku | $0.80 | $4.00 | $0.08 | $1.00 |
| claude-3-opus | $15.00 | $75.00 | $1.50 | $18.75 |
| claude-3-haiku | $0.25 | $1.25 | $0.03 | $0.30 |

### OpenAI

| Model | Input | Output | Cache read |
| --- | --- | --- | --- |
| gpt-4.1 | $2.00 | $8.00 | $0.50 |
| gpt-4.1-mini | $0.40 | $1.60 | $0.10 |
| gpt-4.1-nano | $0.10 | $0.40 | $0.025 |
| gpt-4o | $2.50 | $10.00 | $1.25 |
| gpt-4o-mini | $0.15 | $0.60 | $0.075 |
| gpt-4-turbo | $10.00 | $30.00 | - |
| gpt-4 | $30.00 | $60.00 | - |
| o3 | $2.00 | $8.00 | $0.50 |
| o4-mini | $1.10 | $4.40 | $0.275 |
| o1 | $15.00 | $60.00 | - |
| o1-mini | $3.00 | $12.00 | - |
| o3-mini | $1.10 | $4.40 | - |

### Google

| Model | Input | Output |
| --- | --- | --- |
| gemini-2.0-flash | $0.10 | $0.40 |
| gemini-2.0-pro | $1.25 | $5.00 |
| gemini-1.5-pro | $1.25 | $5.00 |
| gemini-1.5-flash | $0.075 | $0.30 |

<!-- fleet:anatomy:start -->
## What it is made of

Every project in this fleet is graded on the same 11 harness components and on self-improvement. Each mark is backed by a file you can open.

| Component | Grade | Where |
| --- | --- | --- |
| Identity | ✅ | identity/SOUL.md:1 (Ledger; SOUL claims fixed, BRAND, HEARTBEAT and bootstrap MEMORY rewritten, no template slots) |
| Memory | ✅ | memory/MEMORY.md:1 (about 600 tokens) + BM25 index src/memory-search.ts:40 (agentmoney memory-search) + memory/LEARNINGS.md (7 entries, each with a rule) |
| Skills | ✅ | skills/cost-investigation/SKILL.md:1, skills/add-model-pricing/SKILL.md:1, skills/isolate-untrusted-pricing/SKILL.md:1 (moved from .claude/skills, updated to the fixed code) |
| Tools/CLIs | ✅ | package.json:9 (bins agentmoney, agentmoney-mcp; prepare builds on install); src/index.ts:27 (--version); 8 commands |
| Hooks | ✅ | .claude/settings.json:4 (PreToolUse dangerous-command and secret guards) + hooks/hooks.json:3 (plugin SessionStart spend summary, hooks/spend-summary.mjs) |
| Sub-agents | ✅ | .claude/agents/cost-analyst.md:1, .claude/agents/pricing-curator.md:1 (bundled in .claude-plugin/plugin.json) |
| MCPs | ✅ | src/mcp-server.ts:44 (cost_query; answers the client's protocol version; bin agentmoney-mcp) + .mcp.json:3 (its own server through npx, nothing else) |
| Dispatch | ✅ | .github/workflows/cost-watch.yml:23 (daily: prices a session with the product, scripts/cost-watch.mjs routes on a budget gate) + .github/workflows/improve.yml:10 (nightly loop) |
| Evals | ✅ | eval/run.sh:1 (surfaces 43, golden 13 tasks pass^3, offline, Usage API stand-in) gating CI .github/workflows/ci.yml:35 |
| Observability | ✅ | src/logger.ts:13 (every proxied call to .agentmoney/calls.jsonl with tokens, cost, duration) + proxy /costs and /dashboard (src/proxy.ts) + daily reports |
| Sandbox/Infra | ✅ | src/sandbox-runner.ts:63 (E2B microVM) + src/sandbox-pricer.ts:31 (the in-sandbox program, generated from the host rate table) |
| Self-improvement | ✅ | dsip.json:1 (L2) + .github/workflows/improve.yml:10 (nightly) + scripts/improve.mjs (evals, docs and skill coverage, memory, rate freshness, README drift) |

✅ real and tested · 🟡 partial, with the reason in the row · ❌ absent
<!-- fleet:anatomy:end -->

<!-- fleet:footer:start -->
## How it improves itself

It carries its own evals and a self-improvement contract, [`dsip.json`](dsip.json), which says what it may change and how a change is judged. A scheduled job runs its evals and proposes fixes. A person makes every change. Lessons it learns are kept as rules in its memory files.

## Part of a fleet

One of the projects by [Naman Parikh](https://github.com/naman10parikh). Each owns one part of an agent's harness, or of the product around an agent, and all of them follow one standard.

Siblings: [agentdial](https://github.com/naman10parikh/agentdial) (identity) · [wikimem](https://github.com/naman10parikh/wikimem) (memory) · [skillsmith](https://github.com/naman10parikh/skillsmith) (skills) · [agent-booster](https://github.com/naman10parikh/agent-booster) (tools / CLIs) · [armory](https://github.com/naman10parikh/armory) (MCPs and the component registry) · [agentgrid](https://github.com/naman10parikh/agentgrid) (dispatch) · [agentswarm](https://github.com/naman10parikh/agentswarm) (dispatch) · [agentbench](https://github.com/naman10parikh/agentbench) (evals) · [claude-harness](https://github.com/naman10parikh/claude-harness) (the whole harness, as a template).

## Contributing and security

Read [CONTRIBUTING.md](CONTRIBUTING.md). AI-assisted pull requests are welcome. Report a vulnerability privately, as [SECURITY.md](SECURITY.md) explains.

## Star history

[![Star history chart](https://api.star-history.com/svg?repos=naman10parikh/agentmoney&type=Date)](https://star-history.com/#naman10parikh/agentmoney&Date)
<!-- fleet:footer:end -->

## License

MIT, see [LICENSE](LICENSE).
