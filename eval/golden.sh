#!/usr/bin/env bash
# eval/golden.sh: golden behavioural tasks for agentmoney's job, which is to price AI calls and report the spend.
#
# Everything runs for real (the built CLI, the pricing engine, the tracker and its reports, the budget gate, the MCP
# server and the plugin hook) and offline: eval/stub-usage.mjs stands in for the Anthropic Usage API, so no key and no
# network are needed. Each run works in a temporary folder, so this repository's own .agentmoney/ reports are never
# touched. Pass^k: every task must pass K rounds in a row (AM_EVAL_K, default 3).
#
#   pnpm build && bash eval/golden.sh      needs node and python3
#   AM_EVAL_K=1 bash eval/golden.sh        one round
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT" || exit 1
K="${AM_EVAL_K:-3}"
OUT="${AM_EVAL_OUT:-$ROOT/.agentmoney/eval-golden.json}"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/agentmoney-eval.XXXXXX")"
for dep in node python3; do command -v "$dep" >/dev/null 2>&1 || { echo "FAIL: $dep is required"; exit 1; }; done
[ -f dist/index.js ] || { echo "FAIL: dist/index.js missing, run 'pnpm build' first"; exit 1; }
CLI="node $ROOT/dist/index.js"
PKG_VERSION="$(node -p "require('$ROOT/package.json').version")"
NMODELS="$(node --input-type=module -e "import { listModels } from '$ROOT/dist/pricing.js'; console.log(listModels().length)")"

# The stand-in Usage API, on a free local port; stopped on exit.
export STUB_LOG="$TMP/stub.jsonl"
: > "$STUB_LOG"
node "$ROOT/eval/stub-usage.mjs" > "$TMP/stub.port" &
STUB_PID=$!
cleanup() { kill "$STUB_PID" 2>/dev/null; wait "$STUB_PID" 2>/dev/null; rm -rf "$TMP"; }
trap cleanup EXIT
i=0; while [ ! -s "$TMP/stub.port" ] && [ "$i" -lt 100 ]; do sleep 0.1; i=$((i+1)); done
STUB_URL="http://127.0.0.1:$(head -1 "$TMP/stub.port")"
unset ANTHROPIC_API_KEY ANTHROPIC_ADMIN_KEY ANTHROPIC_BASE_URL

PASS=0; FAIL=0; LOG=""
ok()  { echo "  PASS  r$ROUND $1"; PASS=$((PASS+1)); LOG="$LOG{\"round\":$ROUND,\"task\":\"$1\",\"pass\":true},"; }
bad() { echo "  FAIL  r$ROUND $1: $2"; FAIL=$((FAIL+1)); LOG="$LOG{\"round\":$ROUND,\"task\":\"$1\",\"pass\":false},"; }
stub_lines() { wc -l < "$STUB_LOG" | tr -d ' '; }
json() {  # json <file> <python expression over d>
  python3 -c "import json,sys; d=json.load(open(sys.argv[1])); print($2)" "$1" 2>/dev/null
}
plain() { sed -E 's/\x1b\[[0-9;]*m//g'; }

echo "=== agentmoney golden eval: $K round(s), stand-in Usage API at $STUB_URL ==="
START=$(date +%s)
ROUND=1
while [ "$ROUND" -le "$K" ]; do
  rm -rf "$TMP/work" "$TMP/proj" "$TMP/none"
  mkdir -p "$TMP/work" "$TMP/proj/.agentmoney" "$TMP/none"

  # G0: the CLI answers --help with every command, and --version with the package's version.
  HELP="$($CLI --help 2>&1)"; MISSING=""
  for c in proxy calc estimate models demo usage memory-search sandbox-run; do
    printf '%s\n' "$HELP" | grep -q "^  $c " || MISSING="$MISSING $c"
  done
  if [ -z "$MISSING" ] && [ "$($CLI --version 2>&1)" = "$PKG_VERSION" ]; then ok "help-and-version-answer"
  else bad "help-and-version-answer" "missing:$MISSING version $($CLI --version 2>&1)"; fi

  # G1: one call: 5,000 in and 1,000 out on claude-sonnet-4-6 ($3 and $15 per million) is $0.015 + $0.015.
  $CLI calc -m claude-sonnet-4-6 -i 5000 -o 1000 --json > "$TMP/c1.json" 2>&1
  if [ "$(json "$TMP/c1.json" "abs(d['inputCost']-0.015)<1e-12 and abs(d['outputCost']-0.015)<1e-12 and abs(d['totalCost']-0.03)<1e-12")" = "True" ]; then
    ok "calc-prices-one-call"
  else bad "calc-prices-one-call" "$(head -c 200 "$TMP/c1.json")"; fi

  # G2: cache tokens: 3,000 cache reads at $0.30 and 1,000 cache writes at $3.75 per million add $0.00465.
  $CLI calc -m claude-sonnet-4-6 -i 5000 -o 1000 --cache-read 3000 --cache-write 1000 --json > "$TMP/c2.json" 2>&1
  if [ "$(json "$TMP/c2.json" "abs(d['cacheCost']-0.00465)<1e-12 and abs(d['totalCost']-0.03465)<1e-12")" = "True" ]; then
    ok "calc-prices-cache-tokens"
  else bad "calc-prices-cache-tokens" "$(head -c 200 "$TMP/c2.json")"; fi

  # G3: names with a provider prefix or a date suffix resolve to the base model's rate.
  $CLI calc -m anthropic/claude-haiku-4-5-20251001 -i 1000000 -o 0 --json > "$TMP/c3.json" 2>&1
  $CLI calc -m claude-sonnet-4-6-20260301 -i 1000000 -o 0 --json > "$TMP/c4.json" 2>&1
  if [ "$(json "$TMP/c3.json" "abs(d['inputCost']-1.0)<1e-12")" = "True" ] && [ "$(json "$TMP/c4.json" "abs(d['inputCost']-3.0)<1e-12")" = "True" ]; then
    ok "fuzzy-names-match-the-base-model"
  else bad "fuzzy-names-match-the-base-model" "$(head -c 120 "$TMP/c3.json") $(head -c 120 "$TMP/c4.json")"; fi

  # G4: an unknown model is estimated at $3 in and $15 out per million tokens, never an error.
  $CLI calc -m a-model-nobody-priced -i 1000000 -o 1000000 --json > "$TMP/c5.json" 2>&1
  if [ "$(json "$TMP/c5.json" "abs(d['totalCost']-18.0)<1e-12")" = "True" ]; then ok "unknown-model-gets-the-default-rate"
  else bad "unknown-model-gets-the-default-rate" "$(head -c 200 "$TMP/c5.json")"; fi

  # G5: a session estimate: 10 calls of 2,000 in and 500 out on gpt-4o is 10 x $0.01.
  EST="$($CLI estimate -m gpt-4o -c 10 --avg-input 2000 --avg-output 500 2>&1 | plain)"
  if printf '%s' "$EST" | grep -q 'Estimated:  \$0.1000'; then ok "estimate-multiplies-a-session"
  else bad "estimate-multiplies-a-session" "$(printf '%s' "$EST" | tr '\n' ' ' | head -c 200)"; fi

  # G6: the model list has every model in the rate table, with its rates.
  $CLI models --json > "$TMP/m.json" 2>&1
  if [ "$(json "$TMP/m.json" "len(d)==$NMODELS and any(x['model']=='gpt-4o' and x['inputPer1M']==2.5 and x['outputPer1M']==10 for x in d)")" = "True" ]; then
    ok "models-lists-the-rate-table"
  else bad "models-lists-the-rate-table" "$(json "$TMP/m.json" "len(d)") of $NMODELS"; fi

  # G7: usage needs an Admin API key: with none, or with a normal API key, it stops before any request.
  BEFORE=$(stub_lines)
  O1="$(ANTHROPIC_BASE_URL="$STUB_URL" $CLI usage 2>&1)"; R1=$?
  O2="$(ANTHROPIC_BASE_URL="$STUB_URL" ANTHROPIC_API_KEY=sk-ant-api03-not-an-admin-key $CLI usage 2>&1)"; R2=$?
  if [ "$R1" -ne 0 ] && [ "$R2" -ne 0 ] && printf '%s' "$O1$O2" | grep -q "ANTHROPIC_ADMIN_KEY" && [ "$(stub_lines)" = "$BEFORE" ]; then
    ok "usage-needs-an-admin-key"
  else bad "usage-needs-an-admin-key" "rc=$R1/$R2 requests $BEFORE -> $(stub_lines)"; fi

  # G8: usage reads every page of the Usage API, grouped by model, and prices each day's tokens:
  # 1,500 in, 500 out, 200 cache reads, 1,000 five-minute and 100 one-hour cache writes = $0.01641.
  BEFORE=$(stub_lines)
  ANTHROPIC_BASE_URL="$STUB_URL" ANTHROPIC_ADMIN_KEY=sk-ant-admin01-stand-in $CLI usage --days 2 --json > "$TMP/u.json" 2>"$TMP/u.err"
  DAYS="$(json "$TMP/u.json" "[x['date'] for x in d]==['2026-10-01','2026-10-02'] and all(abs(x['totalCost']-0.01641)<1e-9 for x in d)")"
  REQS="$(python3 -c "
import json,sys
rows=[json.loads(l) for l in open(sys.argv[1]).read().splitlines()[int(sys.argv[2]):]]
print(len(rows)==2 and all(r['url'].startswith('/v1/organizations/usage_report/messages?') and 'group_by[]=model' in r['url']
      and r['key']=='sk-ant-admin01-stand-in' for r in rows) and 'page=page_2' in rows[1]['url'])" "$STUB_LOG" "$BEFORE" 2>/dev/null)"
  if [ "$DAYS" = "True" ] && [ "$REQS" = "True" ]; then ok "usage-reads-and-prices-the-usage-api"
  else bad "usage-reads-and-prices-the-usage-api" "days=$DAYS requests=$REQS $(tail -1 "$TMP/u.err")"; fi

  # G9: another coding agent prices a call over MCP; the server answers the protocol version it was asked for and
  # sends nothing back for a notification.
  MCP="$(printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18"}}' \
    '{"jsonrpc":"2.0","method":"notifications/initialized"}' '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' \
    '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"cost_query","arguments":{"model":"claude-sonnet-4-6","input_tokens":5000,"output_tokens":1000}}}' \
    | node "$ROOT/dist/mcp-server.js" 2>/dev/null | python3 -c "
import json,sys
lines=[json.loads(l) for l in sys.stdin if l.strip()]
r={m.get('id'):m for m in lines}
tools=[t['name'] for t in r.get(2,{}).get('result',{}).get('tools',[])]
text=''.join(c.get('text','') for c in r.get(3,{}).get('result',{}).get('content',[]))
cost=json.loads(text)['totalCost']
print(len(lines)==3 and r[1]['result']['protocolVersion']=='2025-06-18' and tools==['cost_query'] and abs(cost-0.03)<1e-12)" 2>/dev/null)"
  if [ "$MCP" = "True" ]; then ok "mcp-prices-a-call"
  else bad "mcp-prices-a-call" "$MCP"; fi

  # G10: the demo writes a daily report whose total is the sum of its 8 calls, and the budget gate routes on it.
  (cd "$TMP/work" && $CLI demo > demo.out 2>&1)
  REPORT="$(ls "$TMP/work/.agentmoney"/report-*.json 2>/dev/null | head -1)"
  EXPECT="$(node --input-type=module -e "
import { calculateCost } from '$ROOT/dist/pricing.js';
const c = [['claude-sonnet-4-6',3200,800,0],['claude-sonnet-4-6',5100,1200,0],['claude-haiku-4-5',1500,400,0],
  ['claude-sonnet-4-6',8000,2500,0],['claude-opus-4-6',4000,1800,0],['gpt-4o',2000,600,0],
  ['claude-sonnet-4-6',12000,3000,8000],['claude-haiku-4-5',900,200,0]];
console.log(c.reduce((s, [m, i, o, r]) => s + calculateCost(m, i, o, r).totalCost, 0));")"
  (cd "$TMP/work" && node "$ROOT/scripts/cost-watch.mjs" --budget 1.00 > gate1.out 2>&1); G1=$?
  (cd "$TMP/work" && node "$ROOT/scripts/cost-watch.mjs" --budget 0.01 > gate2.out 2>&1); G2=$?
  if [ -n "$REPORT" ] && [ "$(json "$REPORT" "d['totalCalls']==8 and abs(d['totalCost']-$EXPECT)<1e-12")" = "True" ] &&
     [ -f "${REPORT%.json}.md" ] && [ "$G1" -eq 0 ] && [ "$G2" -ne 0 ]; then
    ok "demo-report-and-budget-gate"
  else bad "demo-report-and-budget-gate" "report=${REPORT:-none} expect=$EXPECT gate=$G1/$G2"; fi

  # G11: memory search finds a rule this repository learned.
  if $CLI memory-search "pricing tables two homes" --json 2>/dev/null | python3 -c "import json,sys; print(any('LEARNINGS' in h['path'] for h in json.load(sys.stdin)['hits']))" 2>/dev/null | grep -q True; then
    ok "memory-search-finds-a-learned-rule"
  else bad "memory-search-finds-a-learned-rule" "no memory/LEARNINGS.md hit"; fi

  # G12: the plugin's SessionStart hook sums a project's call log, and stays silent where there is none.
  TODAY="$(date -u +%Y-%m-%d)"
  printf '%s\n' "{\"model\":\"claude-sonnet-4-6\",\"totalCost\":0.03,\"timestamp\":\"${TODAY}T10:00:00Z\"}" \
    '{"model":"gpt-4o","totalCost":0.011,"timestamp":"2026-01-01T00:00:00Z"}' > "$TMP/proj/.agentmoney/calls.jsonl"
  H1="$(HOME="$TMP" CLAUDE_PROJECT_DIR="$TMP/proj" node "$ROOT/hooks/spend-summary.mjs" 2>&1)"
  H2="$(HOME="$TMP" CLAUDE_PROJECT_DIR="$TMP/none" node "$ROOT/hooks/spend-summary.mjs" 2>&1)"
  CTX="$(printf '%s' "$H1" | python3 -c "import json,sys; print(json.load(sys.stdin)['hookSpecificOutput']['additionalContext'])" 2>/dev/null)"
  if printf '%s' "$CTX" | grep -q '2 API calls' && printf '%s' "$CTX" | grep -q 'cost \$0.0410' &&
     printf '%s' "$CTX" | grep -q 'today \$0.0300 over 1 calls' && [ -z "$H2" ]; then
    ok "spend-hook-sums-the-call-log"
  else bad "spend-hook-sums-the-call-log" "ctx=[$CTX] empty-project=[$H2]"; fi

  ROUND=$((ROUND+1))
done

SECS=$(( $(date +%s) - START ))
TOTAL=$((PASS+FAIL))
mkdir -p "$(dirname "$OUT")"
printf '{"eval":"golden","k":%s,"pass":%s,"fail":%s,"total":%s,"seconds":%s,"results":[%s]}\n' \
  "$K" "$PASS" "$FAIL" "$TOTAL" "$SECS" "${LOG%,}" > "$OUT"
echo "=== golden: $PASS/$TOTAL passed over $K round(s) in ${SECS}s ==="
[ "$FAIL" -eq 0 ]
