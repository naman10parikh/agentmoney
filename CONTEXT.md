# agentmoney — Session Context

- **Product:** real-time cost monitoring for AI agents (Claude / OpenAI / other LLM APIs).
- **Type:** Node CLI (TypeScript, ESM). `npm`-based (not pnpm). Published to npm as `agentmoney`.
- **Harness:** forged from Energy via harness-forge (CP103) — inherited `.claude/` rules/skills/hooks/commands/agents, memory/, brain/, identity/, eval/ layer added on top of the existing CLI.
- **Status:** v1.0.0 shipped to npm. Build green (`tsc`, 0 errors), 25 vitest tests passing (`pricing.test.ts` 17, `tracker.test.ts` 8). 7 CLI commands live (`calc`, `estimate`, `models`, `proxy`, `usage`, `demo`, default help). Pricing covers 25+ models across Anthropic/OpenAI/Google (current as of March 2026). Docs standardized to the agent-native doc standard (CP104).

## What's next

- Add providers (Mistral / Cohere / DeepSeek) — update `src/pricing.ts` + README tables together + add `pricing.test.ts` cases.
- Refresh model rates as providers change them; cite provider + date.
- Richer TUI dashboard; historical cost trends; budget limits.

## Deeper docs

- Doc map / navigation: `brain/MOC - agentmoney.md`. Architecture: `brain/Architecture - CLI.md`.
- User reference: `README.md`. Build/run: `QUICKSTART.md`. Orchestration + dir map: `AGENTS.md`.
