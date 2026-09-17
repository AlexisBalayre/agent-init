---
name: adapt-to-project
description: Fit the scaffolded agent setup to this repository by confirming the quality gate commands in .agents/quality.toml and writing the project map in AGENTS.md that the other skills read.
argument-hint: "Optional focus, e.g. 'only the quality gate' or 're-run after adding a Python service'"
disable-model-invocation: true
---

# Adapt to project

`agent-init` scaffolds a setup that knows nothing about the repository: the quality gate's commands were inferred from lockfiles and, unless a human confirmed them, are written commented out; and the shipped skills look for the project's commands and docs in a **project map** that does not exist yet. This skill turns that skeleton into this project's config. It is re-runnable: fill only what is missing or what the focus argument names, and never overwrite filled content without asking.

**Facts come from the code; decisions come from the user.** Never invent a command, a convention, or a doc location. What the code cannot tell you becomes a question, or stays open and is listed as deferred in the report.

## 1. Inventory

1. Confirm you are on a feature branch, not the trunk, with a clean tree: this change is reviewed like any other.
2. Read `.agents/quality.toml`, `.agents/worktree.env` and `AGENTS.md`. Note which gate commands are still commented out and whether a `## Project map` section exists outside the `<!-- agent-init:start -->` / `<!-- agent-init:end -->` markers.
3. Collect the instruction files the repository already had: `CLAUDE.md`, `.cursor/rules/`, `.github/copilot-instructions.md`, `CONTRIBUTING.md`, a style guide. Those are primary sources: their project knowledge belongs in `AGENTS.md`, never discarded.

**Done when** you can list every open slot: each commented-out or missing gate command, an empty `WORKTREE_INSTALL` in a project that installs dependencies, each project map row with no value, each instruction file not yet reflected in `AGENTS.md`.

## 2. Survey

On a large repository, delegate the survey to a subagent where the host has one, so file dumps stay out of your context. Establish:

- **Stacks and areas**: manifests and lockfiles (`package.json`, `pyproject.toml`, `go.mod`, `Cargo.toml`, `pom.xml`, `build.gradle`, `Gemfile`, ...), workspace members, and the top-level paths each stack owns.
- **Real commands**: install, format, lint, typecheck, test. CI workflows and task runners (`Makefile`, `justfile`, `package.json` scripts) show what the team actually runs; prefer those over a tool's generic default.
- **Docs**: where the project keeps a glossary, a decision log (ADRs), conventions, an architecture reference, research notes. Search for them; a repo often has them under a name you would not guess.
- **Trunk**: `git symbolic-ref --short refs/remotes/origin/HEAD` (strip `origin/`).
- **Issue tracker**: what the PR bodies and commit messages reference, and whether this session can reach it.

## 3. Confirm with the user

Present in one message: the detected stacks with their paths, the proposed gate commands per stack, the proposed project map, and the questions the code could not answer. Wait for answers before writing anything.

## 4. Quality gate

`.agents/quality.toml` holds one `[[gate]]` block per stack, read by the turn-end hook on every host. Its header documents the format; the constraints that bite:

- Only `key = "value"` string entries. Put regexes (`paths`, `files`) in single-quoted literal strings: escapes are not interpreted.
- `paths` matches the **start** of a changed path, so a gate for one service in a monorepo is `paths = 'services/api/'`.
- `lint_fix` and `lint` receive the changed files as arguments; `typecheck` runs once with none. A tool that does not accept paths needs a wrapper, or belongs in `typecheck`.
- There is no `test` key: tests are too slow to run at every turn end. The test command goes in the project map.

For each gate, **run every command once before activating it**: `lint_fix` and `lint` against one real source file in that gate's paths, `typecheck` as-is. A command that fails on a clean trunk is not ready: leave it commented out and report the failure. A gate the user believes is running but is not is worse than one that is visibly unfinished.

Activate a command by uncommenting it only after it passed and the user confirmed it.

**Worktrees.** Set `WORKTREE_INSTALL` in `.agents/worktree.env` to the command that installs dependencies in a fresh checkout, and run it once in a scratch worktree (`.agents/scripts/worktree-create.sh adapt-check`, then remove it with `git worktree remove`) before writing it. Leave it empty when the project needs no install step.

**Trunk.** The git-safety hook guards `GIT_TRUNK` from the project's `.env`, defaulting to `main`. When the trunk is anything else, add `GIT_TRUNK=<trunk>` to `.env`: without it the hook protects a branch the project does not use, and looks healthy while doing so.

## 5. Project map

Write a `## Project map` section into `AGENTS.md`, **outside** the agent-init markers (the scaffolder owns only what is between them). The shipped skills read this table instead of assuming a layout, so every row matters:

```markdown
## Project map

| What | Where |
| :-- | :-- |
| Trunk | `main` |
| Install | `<command>` |
| Lint | `<command>` |
| Typecheck | `<command>` |
| Test | `<command>`; single file: `<command> <path>` |
| Glossary | `docs/glossary.md` |
| Decisions (ADRs) | `docs/adr/` |
| Conventions | `CONTRIBUTING.md` |
| Architecture | `docs/architecture.md` |
| Plans and research | `docs/plans/`, `docs/research/` |
| Issue tracker | GitHub Issues, or the tracker name plus the team/project identifiers skills need |
```

- A row the project has nothing for says `none`, so a skill skips it instead of searching again.
- Never create a glossary, ADR log or conventions doc to fill a row. If the user wants one, create the smallest version (a glossary with the 5-15 domain nouns that recur across modules, defined as the code uses them) and point the row at it.
- Fold the project knowledge from the instruction files found in step 1 into `AGENTS.md` beside the map, keeping only what holds for every agent. Leave tool-specific content in the tool-specific file, and delete nothing without asking.

## 6. Verify

1. The step 1 inventory now has only the slots the user chose to defer.
2. Run the gate for real: make a trivial edit to one source file that an active gate matches, run `AGENT_EVENT=turn-end AGENT_PROJECT_DIR="$PWD" .agents/hooks/policies/quality-gate.sh`, confirm it exits 0, then revert the edit.
3. Every path in the project map exists, and every command in it runs.
4. `npx agent-init doctor` passes, so the hooks that enforce the gate actually block. When the trunk is not `main`, also run `AGENT_EVENT=pre-tool:bash AGENT_COMMAND="git push origin <trunk>" AGENT_PROJECT_DIR="$PWD" .agents/hooks/policies/git-safety.sh` and confirm it exits 2: doctor probes `main` only.

## 7. Report

End with a table of what was activated, written, and deferred, plus the verification results. Suggest committing the adaptation as its own pull request.
