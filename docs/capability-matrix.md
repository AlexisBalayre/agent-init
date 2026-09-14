# Capability matrix

What each target tool actually supports, and therefore what `agent-init` emits for it.

**Verified: 2026-09-14** against each tool's own documentation, or its source where the docs are
silent. Versions are not pinned yet. These five move fast; treat any row older than a release
cycle as unverified, and re-run `agent-init doctor` after upgrading a tool.

## Discovery paths

| | Project memory | Skills | Hooks | Agents |
| :-- | :-- | :-- | :-- | :-- |
| **Claude Code** | `CLAUDE.md` importing `@AGENTS.md` | `.claude/skills/<name>/SKILL.md` | `.claude/settings.json` | `.claude/agents/*.md` |
| **opencode** | `AGENTS.md` native | `.agents/skills/`, `.claude/skills/`, `.opencode/skills/` — all native | JS plugins only, `.opencode/plugins/` | `.opencode/agent/*.md` |
| **Codex** | `AGENTS.md` native | `.agents/skills/` native, scanned CWD -> repo root; also `.codex/skills/` | `.codex/hooks.json`, or `[hooks]` in `.codex/config.toml` | `[agents]` in `config.toml` |
| **Mistral Vibe** | `AGENTS.md` native | `.agents/skills/`, `.vibe/skills/`, plus `skill_paths` | `.vibe/hooks.toml` | `~/.vibe/agents/*.toml` (user-global) |
| **Cursor** | `AGENTS.md` native, plus `.cursor/rules/*.mdc` | `.cursor/skills/` | `.cursor/hooks.json` | subagents (2026) |

## Hook interfaces

The part that actually differs, and the reason adapters exist.

| | Events used | Input | How a hook blocks |
| :-- | :-- | :-- | :-- |
| **Claude Code** | `PreToolUse`, `PostToolUse`, `Stop` | JSON on stdin | **exit 2**, reason on stderr |
| **Codex** | same names, same fields | JSON on stdin | **exit 2**, reason on stderr — or `{"decision": "block"}` |
| **Cursor** | `beforeShellExecution`, `afterFileEdit`, `stop` | JSON on stdin | **exit 2**, documented as equivalent to `permission: "deny"` |
| **Mistral Vibe** | `pre_tool`, `post_tool`, `post_agent` | JSON on stdin | **exit 0 + `{"decision": "deny", "reason": …}` on stdout** |
| **opencode** | `tool.execute.before/after`, `event` (`session.idle`) | JS objects | **throw** from the hook |

Two consequences the design absorbs:

- **Codex is Claude-shaped.** Same event names, same stdin fields, same exit-2 convention, so both
  are served by one `claude-shaped.sh` and two three-line wrappers.
- **Vibe inverts the convention.** Exit 2 means nothing to it; a denial is exit 0 with JSON on
  stdout, and stdout is reserved for that JSON. Its adapter translates, and keeps every other byte
  on stderr. This is exactly why policies never speak a host's protocol directly.

## The two findings the design rests on

1. **`SKILL.md` is a de facto standard.** All five follow the Anthropic Agent Skills spec: `name`
   and `description` frontmatter, unknown fields ignored. Shipped skills need no format
   translation — only placement.
2. **`.agents/skills/` is already a neutral cross-tool convention.** Codex, opencode and Mistral
   Vibe all read it natively, without configuration — three of the five. Only Claude Code and
   Cursor need the symlink.

Neither holds for agents. See decision 8 in [`design/0001-architecture.md`](design/0001-architecture.md).

## What we emit per tool

| | Memory | Skills | Hooks | Agents |
| :-- | :-- | :-- | :-- | :-- |
| **Claude Code** | `CLAUDE.md` -> `@AGENTS.md` | symlink | `settings.json`, deep-merged | symlink (v0.3) |
| **opencode** | native | nothing: native | JS plugin shim | symlink (v0.3) |
| **Codex** | native | nothing: native | managed block in `config.toml` | none |
| **Mistral Vibe** | native | nothing: native | managed block in `hooks.toml` | none |
| **Cursor** | native | symlink | `hooks.json`, deep-merged | symlink (v0.3) |

## Known gaps

- **opencode cannot enforce at turn-end.** `session.idle` fires after the turn, and opencode
  offers no documented way to feed hook output back into the agent's context, so a failing gate is
  reported there and enforced on Claude Code.
- **opencode is the only adapter `doctor` cannot probe.** The other four are exercised with a real
  payload and asserted to block; opencode's shim needs a live session.
- **Codex `Stop` wiring is inferred.** The documented example covers `[[hooks.PreToolUse]]`; the
  `Stop` block follows the same documented shape but has not been confirmed against a running
  Codex.
- **Mistral Vibe agents are user-global launch profiles**, not project-scoped dispatched
  subagents. Not a like-for-like target, so nothing is emitted.
- **Claude-only:** `PreCompact`, the comment-pruner dispatch, and `Use PROACTIVELY` auto-dispatch.

## Verified against

| Tool | Version | Date | Source |
| :-- | :-- | :-- | :-- |
| Claude Code | _tbd_ | 2026-09-14 | docs |
| opencode | _tbd_ | 2026-09-14 | docs |
| Codex | _tbd_ | 2026-09-14 | docs |
| Mistral Vibe | _tbd_ | 2026-09-14 | source (`vibe/core/hooks/`) |
| Cursor | _tbd_ | 2026-09-14 | docs |

## Sources

- opencode skills — https://opencode.ai/docs/skills/
- opencode plugins — https://opencode.ai/docs/plugins/
- Codex skills — https://learn.chatgpt.com/docs/build-skills
- Codex hooks — https://learn.chatgpt.com/docs/hooks
- Codex advanced config — https://learn.chatgpt.com/docs/config-file/config-advanced
- Cursor hooks — https://cursor.com/docs/agent/hooks
- Cursor rules — https://cursor.com/docs/rules
- Mistral Vibe — https://github.com/mistralai/mistral-vibe (hook models and protocol read from
  `vibe/core/hooks/models.py`, which the docs do not cover)
