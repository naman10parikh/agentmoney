# agentmoney — Community TODOS

A public checklist for agents and contributors. Items marked [x] are complete.
IDs use the pattern `AM-NNN`. PRs welcome — reference the ID in your commit.

## Harness completeness (CP117 wave-D)

- [x] **AM-001** Proxy round-trip integration test — `test/proxy.integration.test.ts`
      Starts the real Express proxy + a local mock upstream; verifies cost recording,
      `/health`, `/costs`, and multi-call accumulation. All 6 integration assertions pass.
- [x] **AM-002** MCP `cost_query` tool — `src/mcp-server.ts`
      Stdio JSON-RPC MCP server exposing `cost_query` (model + token counts → USD breakdown).
      Smoke-tested: initialize → tools/list → tools/call all return correct responses.
- [x] **AM-003** `.claude-plugin` manifest — `.claude-plugin/manifest.json`
      Claude Code plugin manifest wiring the MCP server so it can be registered via the
      Claude Code plugin system. Points at `dist/mcp-server.js` (stdio transport).

## Pricing & models

- [ ] **AM-010** Add Mistral model pricing (mistral-large, mistral-medium, mistral-small)
- [ ] **AM-011** Add Cohere model pricing (command-r-plus, command-r)
- [ ] **AM-012** Add DeepSeek model pricing (deepseek-chat, deepseek-coder)
- [ ] **AM-013** Refresh all rates against provider docs (cite provider + date when updating)

## Dashboard & UI

- [ ] **AM-020** Historical cost trends (7/30-day chart)
- [ ] **AM-021** Budget limits — pause or warn at a configurable daily/monthly cap
- [ ] **AM-022** Better TUI dashboard (blessed or ink) replacing the basic web dashboard
- [ ] **AM-023** CSV export for `estimate` command

## Proxy robustness

- [ ] **AM-030** Handle streaming responses (`stream: true`) — extract usage from final chunk
- [ ] **AM-031** OpenAI streaming support (extract `usage` from `data: [DONE]` SSE chunk)
- [ ] **AM-032** Retry / circuit-breaker for upstream timeouts

## Eval layer

- [ ] **AM-040** Golden cost-calculation eval suite in `eval/` (L3 Hamel pyramid)
      At least 5 golden tasks: correct pricing + cache math + fuzzy matching.
      Eval pass/fail gate: all 5 must match expected cost within 0.001%.

## Contribution guide

See `README.md` for install instructions and `AGENTS.md` for orchestration conventions.
Run `npm test` before every PR — all 31 tests must pass.
