# agent-init

> **Status: all five tools wired.** Not yet published to npm — run it from a clone for now. The architecture is recorded in
> [`docs/design/0001-architecture.md`](docs/design/0001-architecture.md).

One command to give a repository a shared agent setup that **Claude Code, Codex, opencode, Mistral
Vibe, and Cursor all read** — conventions, skills, and deterministic hooks, stored once.

```bash
npx agent-init
```

## The idea

Every one of these tools wants its own directory. Maintain five and they drift: a skill written
three times, a hook wired four ways, a convention updated in one file and stale in the rest.

`agent-init` writes **one** real copy of the content under `.agents/` and points each tool at it.

```
.agents/
├── skills/          # SKILL.md — read natively by opencode and Mistral Vibe
├── agents/          # intersection-only frontmatter, symlinked where portable
├── hooks/
│   ├── policies/    # tool-agnostic shell: git safety, quality gate, naming
│   └── adapters/    # per-tool input parsing and exit-code mapping
└── quality.toml     # per-path lint/typecheck commands, detection-seeded

.claude/skills -> ../.agents/skills
.cursor/skills -> ../.agents/skills
...
```

Two facts make this work, both verified in
[`docs/capability-matrix.md`](docs/capability-matrix.md): all five tools follow the Anthropic
Agent Skills spec, and `.agents/skills/` is already read natively by **three of them** — Codex,
opencode and Mistral Vibe. Only Claude Code and Cursor need the symlink.

## Design in one table

| | |
| :-- | :-- |
| **Scaffolder, not sync engine** | Writes once. Templates bundled in the package, offline-safe. |
| **Emitted output is Node-free** | Markdown and POSIX shell. A Go or Python repo gets no `package.json`. |
| **One content copy** | `.agents/` is canonical; symlinks reconcile, `--no-symlink` copies. |
| **Three normalised hook events** | `pre-tool:bash`, `post-edit`, `turn-end`; policies written once. |
| **Stack-agnostic quality gate** | Commands live in `.agents/quality.toml`, per-path array. |
| **Core plus opt-in packs** | `--packs thinking,engineering,review`. |
| **Honest tiers** | What a tool cannot do is documented, not emulated. |

## Support matrix

| Tool | Memory | Skills | Hooks | Blocking verified by `doctor` |
| :-- | :-- | :-- | :-- | :-- |
| Claude Code | `CLAUDE.md` -> `AGENTS.md` | symlink | `settings.json` | yes |
| Codex | native | native | `config.toml` block | yes |
| Cursor | native | symlink | `hooks.json` | yes |
| Mistral Vibe | native | native | `hooks.toml` block | yes |
| opencode | native | native | JS plugin shim | no — needs a live session |

Skills need no translation: all five follow the Anthropic Agent Skills spec. Hooks do — each host
names its events differently, and Mistral Vibe denies by printing JSON rather than by exit code —
so shared policies are written once and a per-tool adapter speaks each host's protocol.

## Skill packs

Skills are opt-in and off by default:

```bash
npx agent-init --packs thinking,engineering
```

| Pack | Skills |
| :-- | :-- |
| `thinking` | `grilling`, `codebase-design`, `domain-modeling`, `prototype`, `handoff`, `zoom-out`, `write-a-skill` |
| `engineering` | `tdd`, `diagnose`, `resolve-merge-conflicts` |
| `review` | `review-changes` (six-area multi-agent review) + `address-review-comments`, and the seven reviewer subagents they dispatch |

They install once into `.agents/skills/`, where three of the five tools find them with no further
wiring. Each is written against no particular stack: where a skill needs project conventions, a
task runner or a tracker, it asks the project rather than assuming one.

The `review` pack also installs `.agents/agents/` and links it into Claude Code, opencode and
Cursor. Codex and Mistral Vibe have no project-scoped subagents, so nothing is emitted for them and
`review-changes` degrades to dispatching the reviewer briefs inline — the review shrinks in
mechanism, never silently to nothing.

**Prerequisites:** Node >= 20 to run the scaffolder, `jq` and bash >= 3.2 on any machine where the
hooks run.

## Install safety

Refuses a dirty git tree without `--force` — git is the backup. Existing markdown is edited only
between `<!-- agent-init:start -->` markers. JSON config is deep-merged, never clobbered. TOML gets
a text-spliced managed block so comments survive. Re-runs are idempotent.

## Usage

```
agent-init [init]      Scaffold .agents/ and wire each detected tool
agent-init doctor      Probe the wiring and verify hooks actually block

--tools <list>     claude-code, opencode, codex, mistral-vibe, cursor (default: detected)
--packs <list>     thinking, engineering, review (default: none)
--dir <path>       Target repository (default: cwd)
--no-symlink       Copy shared content instead of symlinking it
--skip-hooks       Scaffold content but wire no hooks
--dry-run          Print the plan, write nothing
--check            Exit non-zero if the tree differs from what init would emit
--yes              Apply without confirming
--json             Machine-readable output
--force            Proceed even though the git tree is dirty
```

Every prompt has a flag, so an interactive run is always reproducible as one command — and an
agent driving the CLI never hits a prompt that hangs. Without a TTY and without `--yes`, `init`
prints its plan and exits non-zero rather than guessing.

## Verify it actually works

```bash
npx agent-init doctor
```

Fires a probe hook against each locally installed tool and checks the block landed. Hooks that
silently fail to block are the main risk in a five-tool port; `doctor` is how you catch them, and
its output is the bug-report format.

## License

[MIT](LICENSE)
