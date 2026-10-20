@AGENTS.md

# Claude Code in agentmoney

Everything any coding agent needs is in `AGENTS.md`, imported above. This file holds only what is specific to Claude
Code.

## What loads when you open this repository

- **Hooks** (`.claude/settings.json`): `PreToolUse` on Bash runs `.claude/hooks/block-dangerous-commands.cjs`, and on
  Read, Edit, Write and Bash runs `.claude/hooks/protect-secrets.cjs`, which keeps `.env` files and keys out of the
  session.
- **Sub-agents** (`.claude/agents/`): `cost-analyst` and `pricing-curator` are agentmoney's own; the other seven
  (`architect`, `code-reviewer`, `test-writer` and the rest) are general reviewers for work on this codebase.
- **MCP** (`.mcp.json`): only agentmoney's own server, `agentmoney-mcp`. The inherited development servers (GitHub,
  Context7, a file-backed memory and an Obsidian vault over `brain/`) need a token or a relative path, so they live in
  `.mcp.dev.json`. Load them with `claude --mcp-config .mcp.dev.json`.
- **Rules** (`.claude/rules/`) are glob-loaded every session.

## The plugin

`.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json` make this repository a Claude Code plugin: the
skills in `skills/`, the two sub-agents, the MCP server and the SessionStart hook in `hooks/hooks.json`, which tells
the agent what the project's `.agentmoney/calls.jsonl` says was spent. Check it with `claude plugin validate .`
after you change any of those files.

## Working here

- The tests and evals never call a real API: the Usage API eval runs against `eval/stub-usage.mjs`.
- `agentmoney usage` needs an Admin API key (`ANTHROPIC_ADMIN_KEY`); never paste one into a file or a chat.
- Follow the commit grammar in `AGENTS.md` (`feat(pricing):`, `fix(proxy):` and the rest).
- Act, then test as a user: `pnpm build && pnpm test && pnpm eval`, then the command you changed.
- When you fix an error, add it to `memory/LEARNINGS.md` as what broke, the root cause, and the rule.
