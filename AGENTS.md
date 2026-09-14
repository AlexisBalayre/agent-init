# agent-init

A one-shot CLI that scaffolds a shared agent setup across Claude Code, Codex, opencode, Mistral
Vibe, and Cursor.

## Read first

- [`docs/design/0001-architecture.md`](docs/design/0001-architecture.md) — the nine decisions and
  the cost accepted by each. Do not relitigate one without recording why.
- [`docs/capability-matrix.md`](docs/capability-matrix.md) — what each tool actually supports.
  Verified from docs, with dates. If a claim here is not in that file, verify it before relying on it.

## Rules specific to this repo

- **Emitted output is Node-free.** Anything written into a user's repository is markdown or POSIX
  shell. Node exists only while the scaffolder runs.
- **Near-zero runtime dependencies.** Every dependency is npx cold-start latency. A new one needs a
  justification in the PR.
- **Never claim parity a tool does not have.** A capability gap is documented in the matrix, not
  emulated. Silent degradation is the failure mode this project exists to avoid.
- **Never ship employer-specific or personal content.** No internal tracker IDs, security-scanner
  identifiers, org names, or internal URLs in templates, docs, or tests.
- **Facts about the five tools come from their docs**, with the source recorded in the matrix.

## Naming taxonomy

`*.script.ts` (entrypoints) · `*.utils.ts` (pure helpers) · `*.schemas.ts` (validation).

## Comments

Default to none. Add `//` only for a non-obvious why — an invariant, a unit, an ordering
constraint, a gotcha. Never narrate what the code does.

## Git workflow

Never commit to `main`. Branch per change, PRs only.
