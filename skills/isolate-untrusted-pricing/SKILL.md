---
name: isolate-untrusted-pricing
description: Use when agentmoney must price a call log that came from an UNTRUSTED source — an agent-supplied JSON file, a captured proxy response body, or any model/token data you did not author. Runs the repo's cost engine inside an isolated E2B sandbox via `agentmoney sandbox-run` so a malformed or hostile input can never touch the host filesystem or network.
---

## Trigger

Someone hands agentmoney a batch of API calls to price and you cannot vouch for the
input. Concrete cases: a caller passes `--file untrusted.json` to price an arbitrary
agent's run; the proxy captured a raw upstream response body and you want to re-price
it; a third party shares a `calls.jsonl` from their fleet. The input is data you did
not write, so it must be parsed and executed in isolation, not on the operator's box.

## Why this is a skill (and distinct from cost-investigation)

`cost-investigation` attributes spend from *trusted* logs you produced via the proxy.
This skill is the opposite axis: the input itself is the threat. agentmoney's pricing
path parses arbitrary `model`/token fields and the proxy forwards real response bodies —
both are untrusted surfaces. The repo ships `src/sandbox-runner.ts` (E2B Firecracker
microVM, ~150ms cold start) precisely so this computation runs jailed from the host.
Encoding the decision rule stops anyone from `JSON.parse`-ing a stranger's file directly
on the host.

## Steps

1. **Decide isolation is warranted.** If the call log is something you generated this
   session (your own `demo` / proxy output), price it on the host with `agentmoney calc`
   or `agentmoney estimate` — no sandbox needed. Use the sandbox **only** when the input
   is foreign (a supplied file, a captured body, a fleet export).
2. **Confirm the sandbox credential.** `agentmoney sandbox-run` needs `E2B_API_KEY` in
   `.env` (this repo already carries one for OSS dogfooding; get one at
   https://e2b.dev/dashboard otherwise). Without it the command fails fast with a clear
   message rather than silently falling back to the host.
3. **Run the untrusted log in isolation.**
   `node dist/index.js sandbox-run --file <untrusted.json> --json`
   This boots an E2B microVM, writes the untrusted call log to `/tmp/calls.json` *inside*
   the sandbox, runs the self-contained pricer (`IN_SANDBOX_PRICER`, which imports no host
   modules), captures the JSON cost breakdown, and tears the sandbox down. The host
   filesystem and network are never exposed to the input.
4. **Cross-check against the host engine.** The command also prints `hostTotal` — the
   same calls priced by `src/pricing.ts` on the host using only the (already-validated)
   numeric token counts. Sandbox total and host total should reconcile within rounding;
   a large divergence means the untrusted log carried unexpected model ids or fields —
   investigate before trusting the number.
5. **Report boot/run telemetry.** Surface `bootMs`, `runMs`, `exitCode`, and `sandboxId`
   so the isolation is auditable (it really booted; it really exited 0).

## Verify

- `node dist/index.js sandbox-run --json` (built-in sample) boots a sandbox and prints a
  non-zero `bootMs` plus `exitCode: 0` and a `totalCost` that matches `hostTotal`.
- Pricing a deliberately odd `--file` (unknown model ids) still returns — unknowns fall
  back to Sonnet-tier inside the sandbox, never throw, never touch the host.
- The sandbox is torn down (no orphaned microVMs) — the runner kills it in a `finally`.

## Output

A short isolation report: the sandbox id, boot/run timings, the in-sandbox total vs the
host cross-check, and a one-line verdict (reconciled / divergent → why). No new files —
run the CLI and summarize. This is the safe path for "price this log I didn't write."
