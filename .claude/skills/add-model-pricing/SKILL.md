---
name: add-model-pricing
description: Use when adding a new LLM's per-token rates to agentmoney (e.g. "add Mistral pricing", "support DeepSeek", "add a new Claude/GPT/Gemini model"). Adds the rate to src/pricing.ts, the README pricing table, and a vitest case in one consistent change, with the provider + date cited.
---

## Trigger

A new model (or a whole provider) must be priced. Examples: AM-010 (Mistral),
AM-011 (Cohere), AM-012 (DeepSeek), or any "the calc command doesn't know model X".

## Why this is one skill

In agentmoney, a model rate is **one fact with three views**: the rate table in
`src/pricing.ts`, the pricing table in `README.md`, and a regression test. If they
drift, the CLI lies. This skill keeps them moving together — that is the repo's
single hardest invariant (see `memory/MEMORY.md` "Key Patterns" and `AGENTS.md`
Quality bar).

## Steps

1. **Find the authoritative rate.** Open the provider's official pricing page.
   Record USD per 1M tokens for input, output, and (if offered) cache-read /
   cache-write. Note the URL and today's date — you will cite both.
2. **Add the rate to `src/pricing.ts`.** Insert a new entry in the rate table next
   to the sibling provider's models. Keep the exact key the provider uses (the
   fuzzy matcher strips date suffixes and `provider/` prefixes, so use the bare
   canonical id). Match the surrounding object shape exactly — do not refactor the
   table.
3. **Add the same rate to the README pricing table.** Every model in `pricing.ts`
   MUST also appear in the README (AGENTS.md Quality bar). Add the row, including a
   trailing `<!-- src: <provider-url>, <date> -->` citation comment.
4. **Add a vitest case in `test/pricing.test.ts`.** Assert `calculateCost("<new-model>", N, M)`
   returns the hand-computed USD within `0.001`. This is the canary that catches a
   future typo in the rate.
5. **Verify the fuzzy fallback still holds.** Confirm an unknown variant of the new
   model (e.g. with a date suffix) still resolves, and that genuinely-unknown models
   still fall back to Sonnet-tier ($3/$15) rather than throwing.

## Verify

- `./node_modules/.bin/vitest run test/pricing.test.ts` → all pass (new case green).
- `node dist/index.js calc -m <new-model> -i 5000 -o 1000` → prints the expected cost.
- `node dist/index.js models | grep <new-model>` → the model is listed.
- `grep -c "<new-model>" README.md src/pricing.ts` → appears in BOTH.

## Output

A single conventional commit `feat(pricing): add <provider>/<model> rates`
touching exactly `src/pricing.ts`, `README.md`, and `test/pricing.test.ts`, with the
provider URL + date cited in both the README comment and the commit body.
