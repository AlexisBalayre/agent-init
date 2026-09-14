# 0001 — Architecture decisions

Status: accepted · Date: 2026-09-14

The nine decisions that define `agent-init`. Each records the option taken, the rejected
alternatives, and the cost accepted.

## 1. Scaffolder, not sync engine

`agent-init` writes files once. It is not a compiler that keeps a canonical source and rendered
per-tool outputs in sync.

- **Rejected:** a compiler with `--check` drift detection in CI; a package manager with a registry.
- **Cost accepted:** a user's setup fossilises at the version they scaffolded.
- **Mitigation:** a version stamp (tool version, selected options, per-file hash) is written at
  scaffold time, so a future `agent-init diff` remains possible without committing to one now.

Delivery is `npx agent-init`. Templates ship **inside** the published package — never fetched at
runtime — so the tool and its content version together and the CLI works offline.

Constraints that follow: Node >= 20, ESM, near-zero runtime dependencies (npx cold start is the
budget), and **the emitted output is Node-free**. A Python or Go repo gets markdown and POSIX
shell, no `package.json`, no `node_modules`.

## 2. Scope: conventions + hooks + skills + workflow scripts

- **Rejected:** memory-only (`AGENTS.md` and little else — the `AGENTS.md` convention already
  gives that away for free); memory + hooks without a skill library.

## 3. `.agents/` is canonical; symlinks reconcile

One real directory of content. Per-tool directories hold pointers and wiring only.

Cheapest mechanism first:

1. **Native** — the tool already reads `.agents/skills/`: do nothing (opencode, Mistral Vibe).
2. **Config-declared** — point the tool at the path (Vibe `skill_paths`).
3. **Symlink** — `.claude/skills -> ../.agents/skills`, same for Cursor and Codex.
4. **Copy** — `--no-symlink` fallback.

- **Rejected:** copying everywhere, which recreates the N-copies drift the tool exists to prevent.
- **Cost accepted:** Windows. Symlinks in git need `core.symlinks=true` plus Developer Mode or
  admin; a bad setup materialises the link as a text file and skills silently fail to load.
  Detection and fallback are required, and `doctor` must catch it.

## 4. Hook adapters: three normalised events

Policy scripts are tool-agnostic and written once. A per-tool adapter parses that tool's native
input, exports a common contract (`AGENT_EVENT`, `AGENT_TOOL`, `AGENT_COMMAND`, `AGENT_FILES`,
`AGENT_PROJECT_DIR`), calls the policy, and maps the exit code back to the tool's convention.

Normalised events, capped at three: `pre-tool:bash`, `post-edit`, `turn-end`.

- **Rejected:** lowest-common-denominator hooks; per-tool bespoke hook sets.
- **Cost accepted:** blocking semantics are the least portable part and blocking is the whole
  point of the git-safety policy. Claude Code blocks on exit 2; Cursor expects a JSON verdict;
  Vibe and Codex differ again; opencode has no shell hooks at all and needs a JS plugin shim that
  shells out. A hook that silently fails to block is worse than no hook.
- **Not ported:** anything without a counterpart (Claude's `PreCompact`, the comment-pruner
  dispatch) stays Claude-only and is documented as such.

## 5. Stack-agnostic quality gate

One gate runner, no language knowledge in the script. Commands come from `.agents/quality.toml`,
seeded by repo detection (`pnpm-lock.yaml`, `pyproject.toml`, `go.mod`, `Cargo.toml`) and
confirmed in the wizard. An empty value skips the step; an unknown stack is a silent no-op.

The config holds an **array** of per-path entries, so a repo with a TypeScript frontend and a
Python API is expressible without hand-editing shell.

- **Rejected:** emitting a per-stack gate script; wizard presets copied in verbatim.

## 6. Verification: fixtures over live runs

- Golden-file tests: inputs to exact emitted tree.
- Schema validation of emitted JSON/TOML against each tool's published schema.
- **Contract fixtures**: the real stdin payload each tool sends for each normalised event,
  captured by hand once, committed under `test/fixtures/<tool>/<event>.json`, and asserted
  against every adapter — including that the blocking path returns that tool's refusal shape.
- `agent-init doctor`: runs where the tools are actually installed and authenticated, fires a
  probe hook on a sentinel command, and reports per tool. It is also the bug-report format.
- **Explicit non-goal:** live agent runs in CI (five auth'd CLIs, cost, flake, no headless Cursor).
- **Cost accepted:** fixtures go stale silently when a tool changes its payload. Mitigated by a
  dated "verified against" table, not by a docs-diff job.

## 7. Core plus opt-in packs

`core` always: `AGENTS.md` skeleton, conventions skeleton, hooks and adapters, quality gate,
worktree scripts. Then `--packs thinking,engineering,review`.

- **Never shipped:** skills encoding a specific employer's security stack or issue tracker.
- **Cut:** scaffolding skills written against a fictional demo product. One is reproduced in
  `docs/examples/` as a worked example of how to write a scaffolding skill.
- **Cost accepted:** de-coupling is the bulk of v1. Ported skills must not reference repo-specific
  convention paths; they ask for the project's conventions if any are defined.

## 8. Agents: intersection-only, three tools

Skills are portable because all five tools converged on `SKILL.md`. Agents did not.

Canonical `.agents/agents/*.md` carries only the intersection of frontmatter (`name`,
`description`, body) and is symlinked to Claude Code, opencode, and Cursor. Nothing is emitted for
Mistral Vibe (user-global TOML launch profiles) or Codex (config-embedded) in v1.

The review pack degrades: with no named agents present, `pr-ci-review` carries its reviewer
prompts inline and dispatches them through whatever delegate primitive the host tool has.

- **Cost accepted:** shipped agents cannot restrict their own tool access on any tool, because
  Claude's `tools:` list and opencode's `tools:` map are incompatible and there is no evidence
  agents tolerate unknown frontmatter keys the way skills do. Claude's `Use PROACTIVELY`
  auto-dispatch has no portable equivalent and is documented as Claude-only.

## 9. Install safety

The common case is a repo that already has a `CLAUDE.md` and a `.cursor/`.

- Refuse to run on a dirty git tree without `--force`. Git is the backup.
- Markdown: write if absent; otherwise insert or replace only between
  `<!-- agent-init:start -->` and `<!-- agent-init:end -->`. This is also the re-run path.
- JSON (`settings.json`, `hooks.json`): parse and deep-merge. Add the hooks block; leave
  permissions, MCP servers, and model settings alone. Warn and refuse on a genuine conflict rather
  than silently winning.
- TOML (`.codex/config.toml`, `.vibe/config.toml`): text-splice a managed block. No parse, no
  round-trip, so comments and key ordering survive.
- **Cost accepted:** TOML conflict detection degrades to "the managed block exists and differs".
