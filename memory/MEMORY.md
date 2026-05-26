# agentmoney — Long-Term Memory (index)

> Inherited memory-harness structure from Energy. One line per durable fact.
> Layers: this index → topics/ deep-dives → daily/ logs → archive/ (compressed >30d, never deleted).

## Architecture Decisions

- Pure-math pricing engine: `calc`/`estimate`/`models` need no API calls and run fully offline. Only `proxy` and `usage` touch the network.
- No database, no auth. Runtime output is flat files in `.agentmoney/` (calls.jsonl + daily JSON/Markdown reports).
- ESM + TypeScript strict; published to npm as `agentmoney` with `bin: dist/index.js`.

## Key Patterns

- Fuzzy model-name matching in `src/pricing.ts`: strips date suffixes (`-20260301`) and provider prefixes (`anthropic/`); unknown models fall back to Sonnet-tier ($3/$15).
- `src/pricing.ts` rate tables and the README pricing tables are two views of one fact — update both in the same commit.

## Technology Choices

- `commander` for CLI parsing, `chalk` for output, `express` for the proxy/dashboard. `vitest` for tests, `tsx` for dev mode, `tsc` for build.
- Node `>=18` engine floor.

## People & Resources

- Published OSS: https://github.com/naman10parikh/agentmoney · npm: `agentmoney`. MIT-licensed.

## What NOT to Do

- Don't change a model rate in `src/pricing.ts` without also updating the README table (and vice versa) — a public pricing claim would be wrong.
- Don't add a model to pricing without a `pricing.test.ts` case.

## Operating Model

- Repo is a self-contained agent-native harness forged from Energy (harness-forge, CP103), scrubbed for public OSS (CP104). One repo = one agent flavor.

## Topic Files Index

- (none yet — add deep-dives under `topics/` as they accumulate)
