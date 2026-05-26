# agentmoney — LEARNINGS (append-only)

Every error → root cause → rule. Auto-compressed when >500 lines (memory-compress.sh).

## 2026-05-26 — Pricing tables have two homes; keep them in sync

- **What:** Model rates live both in `src/pricing.ts` (the engine) and in the README pricing tables (the public claim).
- **Root cause:** Two representations of the same fact can silently diverge; a stale README misleads users about cost.
- **Rule:** When you change any rate, update `src/pricing.ts` AND the README table in the same commit, and cite the provider + date. `pricing.test.ts` is the canary — run `npm test`.

## 2026-05-26 — Unknown models must degrade gracefully, not crash

- **What:** Callers pass dated/prefixed model ids the engine has never seen.
- **Root cause:** Hard-failing on an unknown model id would break real workloads that legitimately use new/renamed models.
- **Rule:** Fuzzy-match (strip suffix + provider prefix), then fall back to Sonnet-tier ($3/$15) for unknowns rather than throwing. Cover new matching logic in `pricing.test.ts`.

## 2026-05-26 — The proxy handles live API keys

- **What:** `src/proxy.ts` forwards real requests (and credentials) to the provider.
- **Root cause:** It is the one surface with access to secrets and live traffic.
- **Rule:** Route any proxy change through the `security-reviewer` sub-agent; never log request bodies or auth headers.
