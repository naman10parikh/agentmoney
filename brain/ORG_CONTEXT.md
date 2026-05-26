---
type: company-brain
status: active
created: 2026-05-25
updated: 2026-05-26
tags: [agentmoney, company-brain]
source: README.md
related: ["[[MOC - agentmoney]]", "[[ORG_MEMORY]]"]
---

# agentmoney — ORG_CONTEXT (the company brain's context)

Every agent reads this before acting. "If it is recorded, it happened to the AI."

agentmoney is a public, MIT-licensed Node CLI that answers one question: **what does your AI
actually cost?** Developers run Claude Code, agents, and LLM apps that quietly burn API budget;
agentmoney makes every dollar visible. It prices a single call (`calc`), estimates a session
(`estimate`), proxies live traffic to capture real token usage (`proxy` + web dashboard), and
pulls real spend from the Anthropic usage API (`usage`) — all against a built-in pricing engine
covering 25+ models across Anthropic, OpenAI, and Google.

The product surface is a TypeScript/ESM CLI in `src/`, published to npm as `agentmoney`. There is
no database, no auth, and no server beyond the optional local proxy — pricing is pure math, so
`calc`/`estimate`/`models` run fully offline. The repo is also a self-contained agent-native
harness (forged from Energy via harness-forge): it carries an inherited `.claude/` rules/skills/
hooks layer, a `memory/` + `brain/` knowledge graph, an `identity/` quad, and an `eval/` layer on
top of the original CLI. One repo = one self-contained agent flavor.

The operating context: this is OSS, so correctness of public pricing claims matters most. When a
model rate changes, `src/pricing.ts` and the README pricing tables must be updated together, and
the change should cite the provider and date. See [[MOC - agentmoney]] for the full doc map and
[[ORG_MEMORY]] for accumulated learnings.
