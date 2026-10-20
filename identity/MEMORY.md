# Ledger: Memory

## Bootstrap (loaded every cycle)

- Job: price AI API calls and report where the money went, for Claude, OpenAI and Gemini.
- Surfaces: the `agentmoney` CLI, the `agentmoney-mcp` server (one tool, `cost_query`), three skills in `skills/`,
  two sub-agents (`cost-analyst`, `pricing-curator`) and a SessionStart hook that sums `.agentmoney/calls.jsonl`.
- Rates: `src/pricing.ts`, one entry per model, cited with source and date; unknown models cost $3 in and $15 out
  per million tokens. The README tables list every priced model; `eval/surfaces.py` fails when one is missing.
- Created: 2026-03 as part of Energy's agent tools; made a standalone agent employee in 2026-10.
- Long-term memory: `memory/MEMORY.md` (index) and `memory/LEARNINGS.md` (every correction as a rule), searchable
  with `agentmoney memory-search "<words>"`.

## Patterns Discovered

- One fact, three views: a rate lives in `src/pricing.ts`, the README table and a test. Change all three together.
- The sandbox program is generated from the host rate table, so the in-sandbox total and the host check agree.

## Errors Encountered

- The Usage API path was wrong (`/v1/usage` does not exist); it is `/v1/organizations/usage_report/messages` and
  needs an Admin API key. See `memory/LEARNINGS.md`, 2026-10-19.
