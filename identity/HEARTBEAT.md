# Ledger: Heartbeat

What runs on a schedule, what it checks, and what happens when a check fails. Every run is a GitHub Actions workflow
in `.github/workflows/`; none needs a secret.

## Schedule

| Check | When | What it does | On failure |
| --- | --- | --- | --- |
| Tests and evals (`ci.yml`) | Every push and pull request | `pnpm build`, `pnpm test`, `pnpm eval` (surfaces, then the golden tasks, pass^3) | The run turns red and the change does not merge |
| Improve (`improve.yml`) | Nightly, 10:17 UTC, and on demand | `scripts/improve.mjs`: runs the evals, compares the live CLI and MCP surface with the docs and skills, checks memory and the rate table, writes a proposal | A failing eval turns the run red; proposals go to the run summary for a person |
| Cost Watch (`cost-watch.yml`) | Daily, 08:00 UTC, and on demand | Builds the CLI, runs `agentmoney demo` to price a session, then `scripts/cost-watch.mjs` gates on a budget (default $1.00) | Over budget, or no report, turns the run red |

## Health indicators

- **Healthy:** the last CI, Improve and Cost Watch runs passed, and `src/pricing.ts` is less than 90 days old.
- **Warning:** an Improve proposal is open, such as a stale rate or a priced model missing from the README.
- **Critical:** an eval or test fails on `main`, or Cost Watch breaches its budget.

## Recovery

1. Read the failing step's log (`gh run view --log-failed`).
2. Check `memory/LEARNINGS.md` for the same failure (`agentmoney memory-search "<error words>"`).
3. Fix the cause, run `pnpm build && pnpm test && pnpm eval` locally, and push.
4. Add the lesson to `memory/LEARNINGS.md` as what broke, the root cause and the rule.
