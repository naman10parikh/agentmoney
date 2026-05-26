---
type: company-brain
status: active
created: 2026-05-25
updated: 2026-05-26
tags: [agentmoney, company-brain]
source: memory/LEARNINGS.md
related: ["[[MOC - agentmoney]]", "[[ORG_CONTEXT]]"]
---

# agentmoney — ORG_MEMORY (the company brain's memory)

Every agent writes back here after acting. The fleet inherits every workflow's learnings.
Durable, repo-specific learnings (errors → root cause → rule) accumulate in `memory/LEARNINGS.md`;
this note is the fleet-facing index.

## Seeded learnings

- **Pricing and the README must move together.** Every model in `src/pricing.ts` must also appear
  in the README pricing tables, and vice versa. They are two views of one fact; if they diverge, a
  public claim is wrong. Update both in the same commit.
- **Fuzzy model matching is load-bearing.** Callers pass dated/prefixed model ids
  (`claude-sonnet-4-6-20260301`, `anthropic/claude-sonnet-4-6`). The pricing engine strips suffixes
  and provider prefixes; unknown models fall back to Sonnet-tier ($3/$15). `pricing.test.ts` guards
  this — run `npm test` after any pricing change.
- **The proxy forwards real API keys.** `src/proxy.ts` sits between the app and the provider, so it
  handles live credentials. Treat it as the security-sensitive surface; route proxy changes through
  the `security-reviewer` sub-agent.

See [[ORG_CONTEXT]] for what this company is and [[MOC - agentmoney]] for the doc map.
