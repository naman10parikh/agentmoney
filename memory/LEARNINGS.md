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

## 2026-10-19 — The usage command called an endpoint that does not exist

- **What broke:** `agentmoney usage` called `GET /v1/usage`, which answers 404 Not found (the same as any unknown
  path), so the command could never work, and the README promised it did.
- **Root cause:** the endpoint was written from memory and never run against the real API; no test covered it.
- **Rule:** the Usage API is `GET /v1/organizations/usage_report/messages` with an Admin API key
  (`ANTHROPIC_ADMIN_KEY`). Check a new endpoint with a keyless request first (a real path answers 401, a wrong one
  404), and test the call against a stand-in in the documented shape (`eval/stub-usage.mjs`).

## 2026-10-19 — The sandbox priced with a copy of five rates

- **What broke:** `sandbox-run` priced inside the microVM with a hand-copied table of 5 models and no cache rates, so
  its total disagreed with the host check for most real call logs.
- **Root cause:** the in-sandbox program duplicated the rate table instead of being generated from it.
- **Rule:** the sandbox program is built from `src/pricing.ts` (`src/sandbox-pricer.ts`); `test/sandbox-pricer.test.ts`
  runs it locally and checks it against the host engine for every model.

## 2026-10-19 — The MCP server answered a protocol version that does not exist

- **What broke:** `initialize` answered `protocolVersion: "2025-11-05"`, which is not an MCP version, and the server
  replied to notifications other than `notifications/initialized`.
- **Root cause:** the version was typed by hand and never compared with what clients send.
- **Rule:** answer the version the client asked for when the server speaks it (2024-11-05 to 2025-11-25), else the
  newest; never answer a notification. The golden eval checks both.

## 2026-10-19 — The proxy chose the usage parser by the target and the auth header

- **What broke:** through a target without "anthropic" in its address and without an `x-api-key` header (a gateway,
  or a Bearer token), the proxy read Anthropic's usage block as OpenAI's and recorded every call at 0 tokens and $0.
- **Root cause:** the parser was picked by `targetUrl.includes("anthropic") || x-api-key`, not by the response.
- **Rule:** read the usage block by its shape (`input_tokens` is Anthropic's, `prompt_tokens` OpenAI's).
  `test/proxy.integration.test.ts` covers a Bearer call; run the CLI proxy once by hand after any change to it.


## 2026-10-20 — Streamed replies were never priced

- **What broke:** a reply sent as server-sent events failed `JSON.parse`, so the proxy recorded nothing for it. Every
  streamed call cost $0 in the totals, the reports and the dashboard.
- **Root cause:** the proxy read usage only from a JSON body, and a stream carries it in its events.
- **Rule:** read a `text/event-stream` reply's events: Anthropic's `message_start` and `message_delta`, OpenAI's last
  usage chunk. `test/proxy.integration.test.ts` streams both through the real proxy.
