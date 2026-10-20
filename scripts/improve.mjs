#!/usr/bin/env node
// scripts/improve.mjs: one turn of agentmoney's self-improvement loop (run nightly by .github/workflows/improve.yml).
//
// Deterministic: no model call, no secret, no network (the golden eval talks to a local stand-in API). It measures the
// repository against itself and writes proposals a person can act on:
//   1. runs the evals (eval/run.sh) and reads the golden results;
//   2. reads the live surface (every CLI command in `agentmoney --help`, every MCP tool in tools/list);
//   3. proposes docs for any command or tool that AGENTS.md, README.md and llms.txt never mention;
//   4. proposes skill coverage for any MCP tool no skill teaches;
//   5. checks the memory budget (MEMORY.md within 2,000 tokens) and that every LEARNINGS entry ends in a rule;
//   6. compares eval time with eval/baseline.json;
//   7. checks the rates: the "as of" date in src/pricing.ts, and that every priced model is in the README tables.
// Output: .agentmoney/proposal.md (gitignored). It never edits a tracked file, never commits, never merges.
// Exit 1 when the evals fail, so a scheduled run turns red and notifies the owner.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const NAME = "agentmoney";
const HELP = ["node", ["dist/index.js", "--help"]];           // the CLI's help, and how to read its command list
const COMMANDS = (text) => [...(text.split(/^Commands:/m)[1] ?? "").matchAll(/^\s{2}([a-z][a-z-]+)/gm)].map((m) => m[1]);
const read = (rel) => (existsSync(join(ROOT, rel)) ? readFileSync(join(ROOT, rel), "utf8") : "");
const proposals = [];
const propose = (area, text) => proposals.push(`- **${area}:** ${text}`);

// 1. Evals.
const evalRun = spawnSync("bash", ["eval/run.sh"], { cwd: ROOT, encoding: "utf8", timeout: 600_000 });
const evalOk = evalRun.status === 0;
const golden = JSON.parse(read(".agentmoney/eval-golden.json") || "{}");
if (!evalOk) propose("Evals", "the eval run failed. Read the failing lines below and fix the cause before anything else.");

// 2. The live surface.
const help = execFileSync(HELP[0], HELP[1], { cwd: ROOT, encoding: "utf8" }).replace(/\x1b\[[0-9;]*m/g, "");
const commands = [...new Set(COMMANDS(help))].filter((c) => c !== "help");
const rpc = [{ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }, { jsonrpc: "2.0", id: 2, method: "tools/list" }];
const mcp = spawnSync("node", ["dist/mcp-server.js"], {
  cwd: ROOT, input: rpc.map((r) => JSON.stringify(r)).join("\n") + "\n", encoding: "utf8", timeout: 30_000,
});
const tools = (mcp.stdout || "").split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return {}; } })
  .find((m) => m.id === 2)?.result?.tools?.map((t) => t.name) ?? [];
if (tools.length === 0) propose("MCP", `the MCP server listed no tools. Build (\`pnpm build\`) and check \`${NAME}-mcp\`.`);

// 3. Docs coverage.
const docs = read("AGENTS.md") + read("README.md") + read("llms.txt");
for (const c of commands) if (!docs.includes(`${NAME} ${c}`)) propose("Docs", `\`${NAME} ${c}\` is in --help but not in AGENTS.md, README.md or llms.txt. Document it.`);
for (const t of tools) if (!docs.includes(t)) propose("Docs", `MCP tool \`${t}\` is not described in AGENTS.md, README.md or llms.txt.`);

// 4. Skill coverage.
const skillsDir = join(ROOT, "skills");
const skillText = existsSync(skillsDir)
  ? readdirSync(skillsDir).map((d) => read(join("skills", d, "SKILL.md"))).join("\n") : "";
for (const t of tools) if (!skillText.includes(t)) propose("Skills", `no skill mentions MCP tool \`${t}\`. Add it to the skill that covers its job.`);

// 5. Memory hygiene.
const memTokens = Math.round(read("memory/MEMORY.md").length / 4);
if (memTokens > 2000) propose("Memory", `memory/MEMORY.md is about ${memTokens} tokens, over the 2,000 budget. Move detail to memory/topics/.`);
const learnings = read("memory/LEARNINGS.md").split(/^## /m).slice(1);
const noRule = learnings.filter((e) => !/\*\*Rule:\*\*/.test(e)).map((e) => e.split("\n")[0].trim());
for (const title of noRule) propose("Memory", `LEARNINGS entry "${title}" has no **Rule:** line. Turn the correction into a rule.`);

// 6. Speed against the baseline.
const baseline = JSON.parse(read("eval/baseline.json") || "{}");
if (golden.seconds && baseline.golden_seconds) {
  if (golden.seconds > baseline.golden_seconds * 1.5) propose("Speed", `the golden eval took ${golden.seconds}s against a baseline of ${baseline.golden_seconds}s. Find what slowed down.`);
  if (golden.seconds < baseline.golden_seconds * 0.7) propose("Speed", `the golden eval took ${golden.seconds}s, well under the ${baseline.golden_seconds}s baseline. Lower the baseline in eval/baseline.json.`);
}

// 7. The rates are a public claim: flag a stale "as of" date and any priced model missing from the README tables.
const pricing = read("src/pricing.ts");
const asOf = pricing.match(/as of ([A-Z][a-z]+) (\d{4})/);
if (asOf) {
  const ageDays = Math.floor((Date.now() - Date.parse(`1 ${asOf[1]} ${asOf[2]}`)) / 86_400_000);
  if (ageDays > 90) propose("Rates", `src/pricing.ts says its rates are as of ${asOf[1]} ${asOf[2]} (${ageDays} days ago). Ask the pricing-curator sub-agent to check every rate against the providers' pages and follow skills/add-model-pricing.`);
} else propose("Rates", "src/pricing.ts has no \"as of\" date. Add one so readers know how fresh the rates are.");
const priced = [...(pricing.split("const PRICING")[1] ?? "").split("};")[0].matchAll(/^\s*(?:"([^"]+)"|([\w.-]+)):\s*\{/gm)].map((m) => m[1] ?? m[2]);
const readme = read("README.md");
for (const m of priced) if (!readme.includes(`| ${m} `)) propose("Rates", `\`${m}\` is priced in src/pricing.ts but missing from the README pricing tables.`);

const stamp = new Date().toISOString();
const body = [
  `# ${NAME} improvement proposal, ${stamp}`,
  "",
  `Evals: **${evalOk ? "pass" : "FAIL"}** · golden ${golden.pass ?? "?"}/${golden.total ?? "?"} over k=${golden.k ?? "?"} in ${golden.seconds ?? "?"}s · ${commands.length} CLI commands · ${tools.length} MCP tools · memory about ${memTokens} tokens`,
  "",
  "## Proposals",
  "",
  proposals.length ? proposals.join("\n") : "- None. Every command and tool is documented and taught, memory is within budget, the rates are fresh and listed, and the evals pass.",
  "",
  "A person reviews and merges every change. This loop never merges by itself.",
  evalOk ? "" : "\n## Eval output (last 40 lines)\n\n```\n" + (evalRun.stdout + evalRun.stderr).split("\n").slice(-40).join("\n") + "\n```",
].join("\n");
mkdirSync(join(ROOT, ".agentmoney"), { recursive: true });
writeFileSync(join(ROOT, ".agentmoney/proposal.md"), body + "\n");
console.log(body);
process.exit(evalOk ? 0 : 1);
