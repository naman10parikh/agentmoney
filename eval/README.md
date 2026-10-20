# eval/

agentmoney's evals. `pnpm eval` runs them all; CI runs them on every push and pull request, and the nightly loop
(`scripts/improve.mjs`) runs them before it writes a proposal. None calls a paid or keyed API.

| Level | File | What it checks |
| --- | --- | --- |
| L1 | `surfaces.py` | every surface a coding agent uses is present and well formed: the plugin, hooks, MCP config, skills, sub-agents, memory budget, `llms.txt` links, `dsip.json`, and every model in `src/pricing.ts` is in the README pricing tables |
| L2 | `golden.sh` | 13 tasks against the built CLI, MCP server and hook, pass^3: help and version, one call, cache tokens, fuzzy names, the unknown-model rate, an estimate, the model list, the admin-key guard, the Usage API read, MCP pricing, the demo report and the budget gate, memory search, and the spend hook |
| - | `stub-usage.mjs` | a stand-in for the Anthropic Usage API in its documented shape, so `usage` is tested with no key |

```bash
pnpm build
pnpm eval                      # surfaces, then golden (k=3)
AM_EVAL_K=1 bash eval/golden.sh   # one round
```

The golden results go to `.agentmoney/eval-golden.json`; `eval/baseline.json` holds the expected time, and the loop
proposes a fix when a run takes more than 1.5 times as long. Product unit tests live in `test/` (`pnpm test`).
