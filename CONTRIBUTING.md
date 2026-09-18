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
here edits the shipped skill, and any breakage surfaces here before it reaches anyone else. Edit
either path; they are the same bytes. What you must not do is add a file under `.agents/` that has
no counterpart in `templates/`, because `agentspine --check` compares the committed tree against
what the generator would emit and will fail.

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
| `agentspine --check` | The committed tree drifting from what the generator emits |
| `shellcheck -s bash` | Every shell file we ship, targeting bash 3.2 |
| `scripts/audit-templates.sh` | Employer, personal or originating-repo references in shipped content, and pointers to docs a scaffolded repo will not have |
| `scripts/audit-authors.sh` | A commit authored or committed by an address outside `.github/allowed-authors.txt` |

## House rules

[`AGENTS.md`](AGENTS.md) holds them, and every coding agent in this repository reads it, so it is
the one copy: Node-free output, near-zero runtime dependencies, never claiming parity a tool does
not have, never shipping employer-specific content, the naming taxonomy, and the comment rule. Read
it before your first change.

### Commit identity

`scripts/audit-authors.sh` fails the build if any commit in the history carries an author or
committer address that is not in [`.github/allowed-authors.txt`](.github/allowed-authors.txt). A
wrong identity is not a style problem: it publishes the commit under whichever account owns that
address, and the only way to take it back is rewriting public history. Check `git config
user.email` before your first commit.

### Private leak-audit terms

`scripts/audit-templates.sh` checks shipped content for employer and vendor fingerprints. The
employer-specific terms are deliberately not in the script, because naming them in a public
repository would itself be the leak. Supply them as one term per line in an untracked
`.audit-fingerprints`, or as a regex alternation in `AUDIT_EXTRA_FINGERPRINTS`; CI reads the
latter from a secret. With neither, the script says so on stderr and checks the public terms only.

One thing it does not say, because it is about reviewing rather than writing:

- **A guard nobody has seen fail is not yet a guard.** If you add a check, break the thing it
  protects, watch it fail, then say so in the pull request.

## Design decisions

Anything architectural is recorded in [`docs/design/0001-architecture.md`](docs/design/0001-architecture.md),
including the cost each decision accepts. If you want to change one of those, say in the pull
request which decision you are revisiting and why; that file is the argument, not decoration.

## Reporting a bug

Open an issue; the form asks for what it needs. `agentspine doctor --json` is worth attaching when
the repository is already scaffolded, because it names each tool, whether the wiring is present, and
whether a probe hook actually blocked.
