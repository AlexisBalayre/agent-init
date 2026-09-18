# Contributing

Thanks for looking. This project ships files into other people's repositories, which shapes most of
the rules below.

## Which path is canonical

**`templates/` is canonical. `.agents/` in this repository is a symlink into it.**

```
.agents/skills  -> templates/agents/skills
.agents/agents  -> templates/agents/agents
.agents/hooks   -> templates/agents/hooks
.agents/scripts -> templates/agents/scripts
```

That is deliberate: this repository is scaffolded by its own tool, so editing a skill while working
here edits the shipped skill, and any breakage lands on us first. Edit either path; they are the
same bytes. What you must not do is add a file under `.agents/` that has no counterpart in
`templates/`, because `agent-init --check` compares the committed tree against what the generator
would emit and will fail.

`.github/workflows/claude-code-review.yml` is generated from
`templates/github/workflows/claude-code-review.yml` by `scripts/render-review-workflow.mjs`. Edit
the template or the script, then re-run `node scripts/render-review-workflow.mjs --write`.

## Getting set up

```bash
npm install
npm test          # vitest, no network, no API keys
npm run typecheck
npm run build
```

`jq` and bash >= 3.2 are needed to exercise the hooks. On macOS, `brew install jq shellcheck`.

## What CI holds you to

| Gate | What it catches |
| :-- | :-- |
| `npm test` | Golden files, adapter contract fixtures, the pure hook and review logic |
| `npm run typecheck` / `build` | Types, and that `dist/` still compiles |
| `agent-init --check` | The committed tree drifting from what the generator emits |
| `shellcheck -s bash` | Every shell file we ship, targeting bash 3.2 |
| `scripts/audit-templates.sh` | Employer, personal or originating-repo references in shipped content, and pointers to docs a scaffolded repo will not have |

## House rules worth knowing before you write code

- **Emitted output is Node-free.** Anything written into a user's repository is markdown or POSIX
  shell. Node exists only while the scaffolder runs.
- **Near-zero runtime dependencies.** Every dependency is npx cold-start latency for every user. A
  new one needs a justification in the pull request.
- **Never claim parity a tool does not have.** A capability gap is documented in
  [`docs/capability-matrix.md`](docs/capability-matrix.md), with a source and a date, not emulated.
  Silent degradation is the failure mode this project exists to avoid.
- **Never ship employer-specific or personal content.** No internal tracker IDs, scanner names, org
  names or internal URLs in templates, docs or tests. CI enforces this.
- **Facts about the five tools come from their docs**, with the source recorded in the matrix. Where
  the docs are silent, read the tool's source and cite file and line.
- **A guard nobody has seen fail is not yet a guard.** If you add a check, break the thing it
  protects, watch it fail, then say so in the pull request.
- Naming: `*.script.ts` (entrypoints), `*.utils.ts` (pure helpers), `*.schemas.ts` (validation).
- Comments explain a non-obvious *why*, never what the code does.
- Branch per change, pull requests only. `main` is protected.

## Design decisions

Anything architectural is recorded in [`docs/design/0001-architecture.md`](docs/design/0001-architecture.md),
including the cost each decision accepts. If you want to change one of those, say in the pull
request which decision you are revisiting and why; that file is the argument, not decoration.

## Reporting a bug

`agent-init doctor --json` is the bug-report format: it names each tool, whether the wiring is
present, and whether a probe hook actually blocked. Paste it, with your OS, Node version and the
tool versions involved.
