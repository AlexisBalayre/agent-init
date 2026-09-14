# agent-init

> **Status: early. Design settled, implementation in progress.** Nothing here is published to npm
> yet. The architecture is recorded in [`docs/design/0001-architecture.md`](docs/design/0001-architecture.md).

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
Agent Skills spec, and `.agents/skills/` is already read natively by two of them.

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

## Install safety

Refuses a dirty git tree without `--force` — git is the backup. Existing markdown is edited only
between `<!-- agent-init:start -->` markers. JSON config is deep-merged, never clobbered. TOML gets
a text-spliced managed block so comments survive. Re-runs are idempotent.

## Verify it actually works

```bash
npx agent-init doctor
```

Fires a probe hook against each locally installed tool and checks the block landed. Hooks that
silently fail to block are the main risk in a five-tool port; `doctor` is how you catch them, and
its output is the bug-report format.

## License

[MIT](LICENSE)
