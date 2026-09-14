# Capability matrix

What each target tool actually supports, and therefore what `agent-init` emits for it.

**Verified: 2026-09-14.** Versions are not yet pinned — see "Verified against" below. These five
move fast; treat any row older than a release cycle as unverified.

## Discovery paths

| | Project memory | Skills | Hooks | Agents |
| :-- | :-- | :-- | :-- | :-- |
| **Claude Code** | `CLAUDE.md` importing `@AGENTS.md` | `.claude/skills/<name>/SKILL.md` | `.claude/settings.json` (shell commands) | `.claude/agents/*.md` |
| **opencode** | `AGENTS.md` native | `.agents/skills/`, `.claude/skills/`, `.opencode/skills/` — all native | JS plugins only | `.opencode/agent/*.md` |
| **Mistral Vibe** | `AGENTS.md` native | `.agents/skills/`, `.vibe/skills/`, plus `skill_paths` in config | `.vibe/hooks.toml` (`pre_tool`, `post_tool`, `post_agent`) | `~/.vibe/agents/*.toml` (user-global) |
| **Codex** | `AGENTS.md` native | supported; project path not documented | `.codex/hooks.json` or `[hooks]` in `.codex/config.toml` | `[agents]` in `config.toml` |
| **Cursor** | `AGENTS.md` native, plus `.cursor/rules/*.mdc` | `.cursor/skills/` | `hooks/hooks.json` | subagents (2026) |

## The two findings the design rests on

1. **`SKILL.md` is a de facto standard.** All five follow the Anthropic Agent Skills spec: `name`
   and `description` frontmatter, unknown fields ignored. Shipped skills need no format
   translation — only placement.
2. **`.agents/skills/` is already a neutral cross-tool convention.** opencode and Mistral Vibe both
   read it natively, without configuration.

Neither holds for agents. See decision 8 in [`design/0001-architecture.md`](design/0001-architecture.md).

## What we emit per tool

| | Memory | Skills | Hooks | Agents |
| :-- | :-- | :-- | :-- | :-- |
| **Claude Code** | `CLAUDE.md` -> `@AGENTS.md` | symlink | full (3 events) | symlink |
| **opencode** | native | native, nothing emitted | JS plugin shim | symlink |
| **Mistral Vibe** | native | native, nothing emitted | `hooks.toml` managed block | none in v1 |
| **Codex** | native | symlink | `hooks.json` | none in v1 |
| **Cursor** | native | symlink | `hooks/hooks.json` | symlink |

## Known gaps

- **opencode has no shell hooks.** A small JS plugin shells out to the shared adapters. Verified
  2026-09-14: `tool.execute.before` blocks a tool call by throwing, so the shim can throw on exit 2.
- **Blocking semantics differ per tool** and are the highest-risk part of the port. A hook that
  fails to block exits 0 and looks healthy; `agent-init doctor` exists to catch exactly this.
- **Claude-only:** `PreCompact`, the comment-pruner dispatch, and `Use PROACTIVELY` auto-dispatch
  of agents.
- **Mistral Vibe agents are user-global launch profiles**, not project-scoped dispatched
  subagents. Not a like-for-like target.

## Verified against

| Tool | Version | Date | By |
| :-- | :-- | :-- | :-- |
| Claude Code | _tbd_ | 2026-09-14 | docs |
| opencode | _tbd_ | 2026-09-14 | docs |
| Mistral Vibe | _tbd_ | 2026-09-14 | docs |
| Codex | _tbd_ | 2026-09-14 | docs |
| Cursor | _tbd_ | 2026-09-14 | docs |

## Sources

- opencode skills — https://opencode.ai/docs/skills/
- Codex advanced config — https://learn.chatgpt.com/docs/config-file/config-advanced
- Mistral Vibe — https://github.com/mistralai/mistral-vibe
- Cursor rules — https://cursor.com/docs/rules
- Cursor plugins — https://cursor.com/docs/reference/plugins
- opencode plugins — https://opencode.ai/docs/plugins/
