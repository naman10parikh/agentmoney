# agentmoney — Long-Term Memory (index)

> Inherited memory-harness structure from Energy. One line per durable fact.
> Layers: this index → topics/ deep-dives → daily/ logs → archive/ (compressed >30d, never deleted).

## Architecture Decisions

- Pure-math pricing engine: `calc`/`estimate`/`models` need no API calls and run fully offline. Only `proxy`, `usage` and `sandbox-run` touch the network.
- No database, no auth. Runtime output is flat files in `.agentmoney/` (calls.jsonl + daily JSON/Markdown reports).
- ESM + TypeScript strict; bins `agentmoney` (`dist/index.js`) and `agentmoney-mcp` (`dist/mcp-server.js`), built on install by `prepare`, so `npx -y -p github:naman10parikh/agentmoney agentmoney` works. The npm package `agentmoney` 1.0.0 predates this.

## Key Patterns

- Fuzzy model-name matching in `src/pricing.ts`: strips date suffixes (`-20260301`) and provider prefixes (`anthropic/`); unknown models fall back to Sonnet-tier ($3/$15).
- `src/pricing.ts` rate tables and the README pricing tables are two views of one fact — update both in the same commit; `eval/surfaces.py` fails when a priced model is missing from the README.
- `usage` reads `/v1/organizations/usage_report/messages` with an Admin API key (`ANTHROPIC_ADMIN_KEY`); a one-hour cache write costs twice the input rate.
- The sandbox program is generated from the host rate table (`src/sandbox-pricer.ts`), so the in-sandbox total and the host check agree.

## Technology Choices

- `commander` for CLI parsing, `chalk` for output, `express` for the proxy/dashboard. `vitest` for tests, `tsx` for dev mode, `tsc` for build.
- Node `>=18` engine floor.

## People & Resources

- Public repository: https://github.com/naman10parikh/agentmoney. MIT-licensed. Evals: `pnpm eval` (`eval/`); nightly loop: `scripts/improve.mjs`.

## What NOT to Do

- Don't change a model rate in `src/pricing.ts` without also updating the README table (and vice versa) — a public pricing claim would be wrong.
- Don't add a model to pricing without a `pricing.test.ts` case.
- Don't let a test or eval call a real API: `eval/stub-usage.mjs` stands in for the Usage API.

## Operating Model

- Repo is a self-contained agent-native harness forged from Energy (harness-forge, CP103), scrubbed for public OSS (CP104). One repo = one agent flavor.

## Topic Files Index

- (none yet — add deep-dives under `topics/` as they accumulate)
