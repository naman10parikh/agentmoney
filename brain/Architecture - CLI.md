---
type: architecture
status: active
created: 2026-05-26
updated: 2026-05-26
tags: [agentmoney, architecture]
source: src/index.ts
related: ["[[MOC - agentmoney]]", "[[Doc - README]]", "[[Doc - AGENTS]]"]
---

# Architecture — CLI

Navigation note. Canonical source: [`src/`](../src) (entry: [`src/index.ts`](../src/index.ts)).

How a cost flows through the product:

1. **`src/index.ts`** — commander CLI entry. Defines `calc`, `estimate`, `models`, `proxy`,
   `usage`, `demo` and dispatches to the modules below.
2. **`src/pricing.ts`** — the engine. Per-token rate tables for Claude / OpenAI / Gemini + fuzzy
   model-name matching (strips date suffixes + provider prefixes; unknown → Sonnet-tier fallback).
3. **`src/tracker.ts`** — accumulates spend per model / provider / session.
4. **`src/proxy.ts`** — Express proxy between app and provider; extracts the `usage` block from
   responses to price live traffic. Forwards real API keys (security-sensitive).
5. **`src/dashboard.ts`** — live local web dashboard (Chart.js) served by the proxy.
6. **`src/reporter.ts`** — writes `calls.jsonl` + `report-YYYY-MM-DD.{json,md}` to `.agentmoney/`.
7. **`src/anthropic-usage.ts`** — fetches real spend from the Anthropic `/v1/usage` endpoint.
8. **`src/logger.ts`** / **`src/types.ts`** — chalk output helpers + shared TS types.

No DB, no auth. `calc`/`estimate`/`models` are pure math and run offline. See [[Doc - README]] for
the user-facing command/pricing reference and [[Doc - AGENTS]] for the directory map.

## Related Notes

- [[MOC - agentmoney]]
- [[Doc - README]]
- [[Doc - AGENTS]]
