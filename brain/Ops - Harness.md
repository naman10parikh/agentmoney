---
type: operations
status: active
created: 2026-05-26
updated: 2026-05-26
tags: [agentmoney, operations, harness]
source: CLAUDE.md
related: ["[[MOC - agentmoney]]", "[[Doc - CLAUDE]]", "[[ORG_MEMORY]]"]
---

# Ops — Harness

Navigation note for the inherited agent-native harness layer (forged from Energy via harness-forge,
CP103; scrubbed for public OSS in CP104).

- `.claude/` — `rules/` (glob-loaded operating rules), `skills/` (on-demand capabilities),
  `hooks/`, `commands/`, `agents/` (the sub-agent roster — see [[Doc - AGENTS]]).
- `scripts/` — ops scripts: `budget-manager.sh`, `memory-search.sh`, `memory-compress.sh`,
  `doc-health-check.sh`, `auto-switch.sh`.
- `identity/` — agent identity quad: `SOUL.md`, `MEMORY.md`, `HEARTBEAT.md`, `BRAND.md`.
- `memory/` — `MEMORY.md` (index), `LEARNINGS.md` (append-only), `topics/`, `daily/`, `archive/`.
- `eval/` — eval + observer layer (seeded; see `eval/README.md`).
- `brain/` — this Obsidian navigation graph.

This layer is generic methodology only — all maintainer-specific references were scrubbed for the
public repo. See [[Doc - CLAUDE]] for the operating brief and [[ORG_MEMORY]] for learnings.

## Related Notes

- [[MOC - agentmoney]]
- [[Doc - CLAUDE]]
- [[ORG_MEMORY]]
