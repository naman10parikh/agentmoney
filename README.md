# agentmoney

[![npm version](https://img.shields.io/npm/v/agentmoney)](https://www.npmjs.com/package/agentmoney)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org/)

**Stop guessing what AI costs you.** Real-time cost monitoring for Claude, OpenAI, and Gemini APIs.

You run Claude Code overnight. You wake up. Your API bill is $247. You have no idea which session burned it, which model was used, or whether prompt caching saved you anything.

agentmoney shows you exactly where every dollar goes.

## Install

```bash
npm install -g agentmoney
```

Or run directly:

```bash
npx agentmoney demo
```

## Quick Start

### Calculate a single API call cost

```bash
# How much does a Sonnet call with 5K input / 1K output cost?
agentmoney calc -m claude-sonnet-4-6 -i 5000 -o 1000

# With prompt caching
agentmoney calc -m claude-sonnet-4-6 -i 5000 -o 1000 --cache-read 3000
```

### Estimate a session cost

```bash
# 50 API calls, ~3K input / ~800 output each
agentmoney estimate -m claude-sonnet-4-6 -c 50 --avg-input 3000 --avg-output 800
```

### See all model pricing

```bash
agentmoney models
```

### Run the proxy (intercept real API calls)

```bash
# Start the proxy on port 8999
agentmoney proxy --port 8999 --alert 5.00

# Then point your API client at the proxy:
ANTHROPIC_BASE_URL=http://localhost:8999 your-app

# View live dashboard at http://localhost:8999/dashboard
# View cost JSON at http://localhost:8999/costs
```

### Fetch real Anthropic usage

```bash
# Last 7 days
agentmoney usage

# Last 30 days, JSON output
agentmoney usage --days 30 --json
```

### Run a demo simulation

```bash
agentmoney demo
```

## Example Output

```
  agentmoney demo

  Simulating 8 API calls...

  ........

  agentmoney summary
  ──────────────────────────────────────────────────

    Total cost:      $0.1842
    Total calls:     8
    Sessions:        1

    By provider:
      anthropic       $0.1732  (7 calls)
      openai          $0.0110  (1 calls)

    By model:
      claude-sonnet-4-6              $0.1041  (4 calls, 37.8K tokens)
      claude-opus-4-6                $0.0750  (1 calls, 5.8K tokens)
      claude-haiku-4-5               $0.0027  (2 calls, 3.0K tokens)
      gpt-4o                         $0.0110  (1 calls, 2.6K tokens)
```

## Commands

| Command               | Description                                            |
| --------------------- | ------------------------------------------------------ |
| `agentmoney`          | Show quick start guide and available commands          |
| `agentmoney demo`     | Simulate 8 API calls and see the cost breakdown        |
| `agentmoney calc`     | Calculate cost for a single API call                   |
| `agentmoney estimate` | Estimate cost for a multi-call session                 |
| `agentmoney models`   | List all supported models and pricing                  |
| `agentmoney proxy`    | Start a local proxy with web dashboard + cost tracking |
| `agentmoney usage`    | Fetch real usage data from the Anthropic API           |

## Proxy Mode

The proxy sits between your application and the AI API, intercepting responses to extract token usage and calculate costs in real-time.

```
Your App → agentmoney proxy (localhost:8999) → api.anthropic.com
                ↓
          Cost tracking
          Web dashboard (Chart.js)
          JSONL call log
          Session reports
```

### Proxy Endpoints

| Path             | Description                                                                             |
| ---------------- | --------------------------------------------------------------------------------------- |
| `GET /dashboard` | Web dashboard with Chart.js charts (cost per agent/day, model breakdown, hourly trends) |
| `GET /health`    | Proxy status + total cost (JSON)                                                        |
| `GET /costs`     | Full cost breakdown (JSON API)                                                          |
| `* /*`           | All other requests proxied to the target                                                |

### Alert Thresholds

```bash
# Warn when session cost exceeds $5
agentmoney proxy --alert 5.00
```

## Supported Models & Pricing

Pricing is current as of March 2026. Fuzzy model name matching handles date suffixes (`claude-sonnet-4-6-20260301`) and provider prefixes (`anthropic/claude-sonnet-4-6`). Unknown models default to Sonnet-tier pricing ($3/$15).

### Anthropic

| Model             | Input/MTok | Output/MTok | Cache Read/MTok | Cache Write/MTok |
| ----------------- | ---------- | ----------- | --------------- | ---------------- |
| claude-opus-4-6   | $5.00      | $25.00      | $0.50           | $6.25            |
| claude-opus-4-5   | $5.00      | $25.00      | $0.50           | $6.25            |
| claude-sonnet-4-6 | $3.00      | $15.00      | $0.30           | $3.75            |
| claude-sonnet-4-5 | $3.00      | $15.00      | $0.30           | $3.75            |
| claude-haiku-4-5  | $1.00      | $5.00       | $0.10           | $1.25            |
| claude-opus-4-1   | $15.00     | $75.00      | $1.50           | $18.75           |
| claude-3-5-haiku  | $0.80      | $4.00       | $0.08           | $1.00            |
| claude-3-haiku    | $0.25      | $1.25       | $0.03           | $0.30            |

### OpenAI

| Model        | Input/MTok | Output/MTok | Cache Read/MTok |
| ------------ | ---------- | ----------- | --------------- |
| gpt-4.1      | $2.00      | $8.00       | $0.50           |
| gpt-4.1-mini | $0.40      | $1.60       | $0.10           |
| gpt-4.1-nano | $0.10      | $0.40       | $0.025          |
| gpt-4o       | $2.50      | $10.00      | $1.25           |
| gpt-4o-mini  | $0.15      | $0.60       | $0.075          |
| o3           | $2.00      | $8.00       | $0.50           |
| o4-mini      | $1.10      | $4.40       | $0.275          |
| o1           | $15.00     | $60.00      | —               |

### Google

| Model            | Input/MTok | Output/MTok |
| ---------------- | ---------- | ----------- |
| gemini-2.0-flash | $0.10      | $0.40       |
| gemini-2.0-pro   | $1.25      | $5.00       |
| gemini-1.5-flash | $0.075     | $0.30       |

## Reports

agentmoney saves reports to `.agentmoney/`:

- `calls.jsonl` — Every API call as a JSON line (append-only log)
- `report-YYYY-MM-DD.json` — Daily cost report (structured data)
- `report-YYYY-MM-DD.md` — Daily cost report (markdown, shareable)

## Configuration

| Flag               | Default                     | Description                               |
| ------------------ | --------------------------- | ----------------------------------------- |
| `--port <n>`       | `8999`                      | Proxy port                                |
| `--target <url>`   | `https://api.anthropic.com` | Target API URL                            |
| `--alert <amount>` | none                        | Warn when session cost exceeds this (USD) |
| `--json`           | false                       | Output as JSON (calc, models, usage)      |
| `--model <id>`     | required                    | Model name for calc/estimate              |
| `--days <n>`       | 7                           | Days to fetch for usage command           |

## Anthropic Usage API

Fetch your real API spending directly from Anthropic (no proxy needed):

```bash
agentmoney usage --days 30
```

Calls the Anthropic `/v1/usage` endpoint and calculates costs using the same pricing engine. Requires `ANTHROPIC_API_KEY` with admin-level permissions.

## How It Works

1. **Proxy mode:** Express server intercepts API responses, extracts the `usage` block (input_tokens, output_tokens, cache tokens), calculates cost using built-in pricing tables, logs to JSONL, serves web dashboard
2. **Calc mode:** Pure math — model + tokens = cost. No API calls needed.
3. **Estimate mode:** Calc x number of calls. Quick session budgeting.
4. **Usage mode:** Fetches real spending from the Anthropic API.
5. **Pricing engine:** Fuzzy model name matching, supports 25+ models across 3 providers. Updated March 2026.

## Contributing

PRs welcome. Especially:

- Updated model pricing
- New provider support (Mistral, Cohere, DeepSeek, etc.)
- Better TUI dashboard (blessed/ink)
- Historical cost tracking and trends
- Budget limits and alerts

## License

MIT
