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
- **False positives are preferred to bypasses.** `git-safety` matches the raw command text, so a
  command merely *containing* a dangerous pattern as data — a heredoc documenting one, a `grep`
  for it — is blocked. Parsing shell instead would mean a parser that can disagree with the user's
  actual shell, and a disagreement there is a bypass rather than an inconvenience. Confirmed the
  hard way while building this: writing these very policies through a shell heredoc tripped them.

## 5. Stack-agnostic quality gate

One gate runner, no language knowledge in the script. Commands come from `.agents/quality.toml`,
seeded by repo detection (`pnpm-lock.yaml`, `pyproject.toml`, `go.mod`, `Cargo.toml`) and
confirmed in the wizard. An empty value skips the step; an unknown stack is a silent no-op.

The config holds an **array** of per-path entries, so a repo with a TypeScript frontend and a
Python API is expressible without hand-editing shell.

- **Rejected:** emitting a per-stack gate script; wizard presets copied in verbatim.

## 6. Verification: fixtures over live runs

- Golden-file tests: inputs to exact emitted tree.
- Schema validation of emitted JSON/TOML against each tool's published schema. **Not built.** What
  exists instead is narrower and stronger where it applies: the emitted Vibe `hooks.toml` is parsed
  by Vibe's own strict loader (decision 17).
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

## 10. Dual-mode CLI, flag-complete

A large share of installs will be an agent running the command, not a human. Interactive prompts
render ANSI, block on a TTY, and hang in a subprocess.

Interactive only when stdin is a TTY **and** no flags were passed. Otherwise fully
non-interactive, on detection-based defaults. Three rules:

- **Flag-complete.** Every prompt has an equivalent flag, so any interactive run is reproducible as
  a single command.
- **Plan, then apply.** `init` prints the exact file list — created, merged, symlinked, skipped —
  and applies on confirm. `--yes` skips the confirm, `--dry-run` never writes. Non-TTY without
  `--yes` prints the plan and exits non-zero rather than guessing.
- **`--json`** on `doctor` and on the plan. `doctor` output is the bug-report format; nobody should
  parse box-drawing characters.

- **Cost accepted:** the flag set is a public API from v0.1.
- **Inferred configuration is never silently active.** A `quality.toml` command that detection
  guessed, with nobody confirming it, is written commented-out with a `TODO`. Active only after an
  interactive confirm or an explicit flag. A gate the user believes is running but is not belongs
  to the same failure class as a hook that fails to block.

## 11. The repository dogfoods its own output

`.agents/skills` in this repo symlinks into `templates/agents/skills/`, so editing a skill while
working here edits the shipped skill. The committed per-tool wiring is the worked example.

CI runs four jobs:

1. `typecheck` and `build`
2. `vitest` — golden files, schema validation, adapter contract fixtures
3. `agent-init --check` — fails when the committed tree differs from what the current generator
   would emit. This is the integration test: free, no API keys, and it catches a generator change
   the committed tree did not follow. It compares *content*, not inodes, so the shared trees this
   repo symlinks into `templates/` resolve to the same bytes a copy would and do not read as drift.
4. `shellcheck -s bash` over `templates/agents/hooks/**/*.sh`

- **Cost accepted:** dogfooding exercises one stack only. Detection for Python, Go, and Rust needs
  small fixture repos under `test/`, asserted against the detector.
- **Cost accepted:** editing `.agents/` edits shipped content through a symlink. `CONTRIBUTING.md`
  must say which path is canonical.

## 12. bash 3.2, and `jq` is a prerequisite

Emitted shell targets **bash 3.2** — the version macOS ships, and what Git Bash provides.
`shellcheck -s bash` enforces it; bash-4-only features (associative arrays, `${var,,}`) are banned.
POSIX `sh` was rejected: it costs `pipefail` and buys no real reach.

Adapters must read JSON from stdin, and **macOS ships no `jq`**. Hand-rolled shell JSON extraction
is rejected outright: the field being parsed is the command under guard, so a parse bug defeated by
an embedded quote is a bypass in the hook whose only job is blocking. Where a tool exposes the same
data as environment variables, those are preferred and `jq` is not invoked.

Missing-`jq` behaviour, chosen so it can never be quiet:

- `init` refuses to wire hooks, suggests the install command, and offers `--skip-hooks`.
- `doctor` reports a hard failure.
- If `jq` disappears later, the adapter **fails open** and writes a loud warning to stderr on every
  invocation. Failing closed would block every Bash call in every session and read as a broken tool.

## 13. v0.1 is a vertical slice: Claude Code and opencode

Those two bracket the difficulty. Claude Code has rich shell hooks with matchers; opencode has no
shell hooks at all and needs a JS plugin shim. A contract satisfying both ends generalises; one
proven on Claude Code alone proves nothing about portability, which is the thesis.

**Verified before committing to the design (2026-09-14):** opencode plugins *can* block. The
`tool.execute.before` hook aborts a tool call by throwing, so the shim can spawn the shared adapter
and throw on exit 2. Had it been unable to block, `git-safety` would have been Claude-only and the
product's framing would have had to change.

Sequence: **v0.1** two tools, complete stack, published early with the support matrix leading the
README. **v0.2** Codex, Mistral Vibe, Cursor. **v0.3** the skill packs — content de-coupling should
not block the mechanism.

- **Rejected:** breadth-first across five tools with skills only (barely more than what the
  `AGENTS.md` convention already gives away); depth-first on Claude Code; all five at once.

## 14. v0.2 addendum: what the remaining three tools did to the contract

Verified 2026-09-14 while wiring Codex, Mistral Vibe and Cursor. The three-event contract survived
all five hosts unchanged, but two findings are worth recording because they justify the adapter
layer more sharply than the original argument did.

**Codex is Claude-shaped.** Same event names (`PreToolUse`, `Stop`), same stdin fields, same
"exit 2 blocks with the reason on stderr" convention. One `claude-shaped.sh` implementation now
serves both, with three-line wrappers naming the tool. The wrappers are kept rather than collapsed:
wiring and `doctor` output name a tool, not a shape, and the shapes can diverge at any release.

**Mistral Vibe inverts the blocking convention.** It does not honour exit 2. A hook denies by
exiting **0** and printing `{"decision": "deny", "reason": …}` on **stdout**, with stdout reserved
for that JSON. Its adapter therefore translates: it captures the policy's stderr, and on exit 2
emits the JSON denial and exits 0. Vibe's own model does carry a `CLAUDE_CODE` protocol option, but
it is not settable from a TOML-declared project hook, so translation is the only route.

This is the case the design was built for. A policy that spoke a host protocol directly would have
been silently unenforced on Vibe — exit 2 would have been read as a hook error, not a denial, and
`git-safety` would have allowed everything while appearing wired.

`doctor` now probes four of the five with a real payload and asserts the block landed, each against
its own convention. opencode remains unprobeable without a live session.

## 15. v0.3: packs, and a CI guard instead of a promise

The first two packs ship: `thinking` (7 skills) and `engineering` (3). Both are opt-in and off by
default.

De-coupling turned out far cheaper than budgeted. The measured coupling — 20 files touching
`docs/conventions/`, 17 touching a fictional product — concentrated in a handful of *lines*, not a
rewrite of every skill: a doc-location table, a set of domain-specific vocabulary examples, a
generated-artifact list naming one stack's tools, and two lines of guidance in `write-a-skill`.
Each became a question the skill asks the project instead of an answer it assumes.

**The leak audit is now a script, not a promise.** `scripts/audit-templates.sh` fails CI when
shipped content carries employer or personal fingerprints (vendor names, tracker keys, internal
hosts) or references to the repository this content came from. Auditing by intention does not
survive the fifth port at midnight; auditing in CI does. It was verified by planting a leak and
watching it fail, on the same principle as every other check here: a guard nobody has seen fail is
not yet a guard.

The audit that motivated it found no employer secrets in the ported set — the three hits were a
generic mention of a well-known CI tool, a fictional org in an example URL, and two config *key*
names. The genuinely sensitive skills were excluded from the port at decision 7 and remain excluded.

## 16. The review pack, and two skills that could not travel

The `review` pack ships seven reviewer subagents, a `review-changes` orchestrator and
`address-review-comments`. Agents install to `.agents/agents/` and are symlinked into Claude Code,
opencode and Cursor; Codex and Mistral Vibe get nothing, and the orchestrator carries a documented
degradation path so the review loses its mechanism rather than its existence.

Frontmatter is stripped to `name` and `description` on the way in, per decision 8. `tools` and
`model` are dropped: Claude's list and opencode's map are incompatible, and unlike skills, agents
are not documented to ignore unknown keys.

**Two skills were dropped rather than ported, and the reason is the same for both: their data
source does not exist outside the originating repository.**

- `pr-ci-review` presumes a private GitHub action — a preflight that supplies the review mode, a
  config-restore step, records committed to a metrics branch, and a poster that renders a JSON
  record onto the PR. Roughly a third of the skill addresses that harness. What shipped instead is
  `review-changes`: the same roster, gating, briefing and consolidation discipline, with the CI
  machinery removed and a name that does not promise a pipeline.
- `review-retro` mines the records that pipeline produces. With no records, it has nothing to read.

Shipping either as-is would have produced a skill that reads plausibly and cannot work — the
failure mode this project has rejected at every other decision.

**The leak audit caught something the manual pass missed.** A reviewer manifest carried an
`(ACME-XXXX)` example token and a `core.md` reference on a line my case-sensitive grep skipped. The
script is case-insensitive and ran on every file, which is the entire argument for decision 15: a
check that runs is worth more than an intention that is careful.

## 17. Correcting the record, and the gate that was only written down

An audit of these decisions against the code found five agreed items unbuilt, two of which this
document described in the present tense as though they were running: the `--check` drift gate and
schema validation of emitted config. A design record that overstates what exists is worse than a gap,
because it stops anyone from noticing the gap.

- **`--check` is now built and wired into CI**, and the repository is genuinely scaffolded by its own
  tool rather than partially by hand. Turning the gate on immediately found 18 paths the tool would
  emit that had never been emitted — the dogfooding in decision 11 was real for hooks and settings
  and aspirational for everything else. It was then verified the only way a guard can be: by
  breaking `CLAUDE.md` and watching the gate fail.
- **Schema validation is marked unbuilt** rather than described as a job that runs.

Still unbuilt and now recorded honestly: the version stamp (decisions 1 and 9), a symlink-failure
fallback for Windows (decision 3), and interactive tool/pack selection (decision 10 — today the
interactive path is a single confirm, and every option is reachable by flag).

## 18. Tracking the September 2026 template, and a project map instead of a layout

Date: 2026-09-17

The skills and reviewers were ported from a Claude Code configuration template that has since
refreshed its skills from upstream (mattpocock/skills), adopted upstream's names and added nine
skills. This decision records how that version was taken in, and what had to change for the port
to stay portable.

**Upstream names are adopted.** `diagnose`, `resolve-merge-conflicts` and `write-a-skill` become
`diagnosing-bugs`, `resolving-merge-conflicts` and `writing-for-agents`. A one-to-one name mapping
makes the next sync a diff rather than a translation. Nothing is published yet, so no installed
base carries the old names.

**The upstream template assumes a layout; agent-init cannot.** Its skills now read commands from
`.claude/project.env`, docs from a fixed `docs/` tree, the trunk from config, and a tracker through
`.env` identifiers. A repository scaffolded by agent-init has none of these. The first port
answered the same problem with "ask the project" in each skill, which made every skill ask. This
one gives them a single place to look: a **project map**, a table in `AGENTS.md` outside the managed
markers, naming the commands, the trunk, the tracker and where each kind of doc lives. Every host
reads `AGENTS.md`, so the map costs no wiring.

**`adapt-to-project` ships in core, not in a pack.** The map needs a writer, and decision 10 left a
gap: an agent running `init` without a TTY gets inferred gate commands written commented out, with
nothing that ever finishes the job. The skill closes both: it runs each inferred command, activates
only what passes once the user confirms, and writes the map. It also sets `GIT_TRUNK` when the trunk
is not `main`, since git-safety otherwise guards a branch the project does not use. Skills stay
opt-in; this is the one that makes the rest work.

- **Rejected:** a `test` key in `quality.toml`. The gate runs at every turn end; tests do not
  belong there, and a key the gate ignores is a trap.
- **Rejected:** shipping `.claude/project.env`. It is one tool's directory and would be a second
  config beside `quality.toml`.

**`planning` requires `thinking` and `engineering`.** `wayfinder` invokes `grilling`,
`domain-modeling`, `prototype` and `research`; `implement` invokes `tdd`. Installing `planning`
alone would ship skills that name skills that are not there, so the plan pulls the required packs
in and lists them. `tdd`'s pointer to `codebase-design` is an optional aside and already shipped
that way, so `engineering` stays standalone.

**Tracker wiring is host-neutral.** Upstream names one vendor's MCP tools and `TRACKER_*` variables,
which the leak audit rejects by design. The planning skills instead use whatever tracker the session
can reach, take identifiers from the map or ask once, and fall back to local markdown under
`docs/plans/`. Upstream keeps that directory out of git with a pre-commit hook agent-init does not
emit, so the skills ask whether to commit or ignore it rather than claiming a guard that is absent.

**Cost accepted: user-only skills are not user-only everywhere.** Nine skills are meant to fire only
when a human names them, marked with `disable-model-invocation: true`. Verified 2026-09-17, only
Claude Code and Cursor honour it. Codex and opencode each have a different native switch, unbuilt;
Mistral Vibe has none. On those three the skills are model-invocable and their descriptions load
into context. The gap is recorded in the capability matrix rather than emulated.

**Not taken in:** upstream's convention spot-check, file-naming, generated-path and comment-pruner
hooks. They would fit the three normalised events, but each is a new policy with its own blocking
and false-positive trade-offs, not a refresh of one already shipped, so each is its own port. Its
personal-integration skills stay out under decision 7.

## 19. The rest of the template's portable skills

Date: 2026-09-17

Six more skills come across from the template: `grill-me`, `grill-with-docs`,
`improve-codebase-architecture` and `caveman` into `thinking`, `find-dead-code` into `engineering`,
and `pr-description` into `review`. The same substitutions as decision 18 apply: the project map
instead of `.claude/project.env` and a fixed `docs/` tree, the host's tracker instead of one
vendor's tools, and a fallback wherever a step assumes sub-agents.

- **`improve-codebase-architecture` sits in `thinking`, not `engineering`** where the template files
  it. It cannot run without `grilling`, `codebase-design` and `domain-modeling`, and placing it
  beside them avoids making `engineering` depend on another pack for one skill.
- **`pr-description` defers to the repository.** A PR template under `.github/` or a documented
  title convention wins over the skill's own house style, and it adds an attribution footer only
  when the project or host requires one. The template's rule forbidding attribution is a personal
  preference, and a shipped skill must not override a host's attribution policy.

**Still excluded, each under an existing decision:** `fix-sonar`, `fix-wiz` and `wiz` encode one
security stack, and `obsidian-vault` and `daily-note` one person's notes (decision 7).
`backfill-issues` is built on one tracker's model of cycles, estimates and labels, which a
host-neutral rewrite would have to invent (decision 7).

## 20. Worktree scripts, finally in core

Date: 2026-09-17

Decision 7 listed worktree scripts in `core`; they were never built. They now ship as
`.agents/scripts/worktree-create.sh` and `worktree-clean.sh`, ported from the template: create puts
each change in `.worktrees/<name>` on a `<prefix>/<name>` branch and installs dependencies inside
it; clean removes prefixed worktrees whose remote branch is gone.

- **Config lives in a committed `.agents/worktree.env`**, created once and never overwritten, like
  `quality.toml`. The install command is project knowledge every clone needs, so it cannot live in
  `.env`, which is per-machine and usually ignored. It is sourced as shell, which is the same trust
  as running the script itself.
- **A failed install fails the create.** The template's script let the install error abort under
  `set -e` with no message saying which step failed; an agent reading only the exit code could
  still start work in a worktree with no dependencies. The script now names the failed command.
- **`.gitignore` gets a managed block** for `.worktrees/`, spliced with `#` markers, the same
  mechanism as the TOML blocks. The splice flag is renamed from `toml` to `hashComments` to say so.
- **Dropped from the template's script:** the CodeGraph index step, since agent-init does not ship
  CodeGraph.
- **Not added:** a git-safety rule blocking `git checkout -b` on the trunk in favour of worktrees.
  It would force one branching style on every project the hook lands in.
