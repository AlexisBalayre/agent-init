---
name: resolving-merge-conflicts
description: Resolve an in-progress git merge or rebase conflict. Use when a merge, rebase, or cherry-pick stops on conflicts.
---

1. **See the current state** of the merge/rebase. Check `git status`, the git history of both sides, and the conflicting files.

2. **Find the primary sources** for each conflict. Understand deeply why each change was made, and what the original intent was. Read the commit messages, check the PRs (`gh pr view`), check the original issues or tickets the PR bodies reference.

3. **Resolve each hunk.** Preserve both intents where possible. Where incompatible, pick the one matching the merge's stated goal and note the trade-off. Do **not** invent new behaviour. Always resolve; never `--abort`.

4. **Regenerate, don't hand-merge.** Conflict markers in generated files are never resolved by hand:
   - Lockfiles (`package-lock.json`, `yarn.lock`, `poetry.lock`, `uv.lock`, `Cargo.lock`, `go.sum`, ...): merge the manifest first, take either side of the lockfile wholesale, then regenerate it with the project's package manager (its install command usually does it).
   - Generated migrations and their metadata (journals, snapshots): drop this branch's generated migration, re-run the migration generator against the merged schema, then format the output with the project's formatter. Never hand-edit a migration journal or checksum.
   - Any other generated artifact (codegen stubs, generated API references, schema diagrams): re-run its generator against the merged sources; never edit the output.

5. **Run the automated checks** and fix anything the merge broke. Run the project's lint, typecheck and test commands (the project map in `AGENTS.md` names them), scoped to the affected area when the runner allows. Failures that already exist on the base branch are not the merge's fault: verify that before spending time on them, and skip verification hooks (`--no-verify`) only for those.

6. **Finish the merge/rebase.** Stage everything and commit. If rebasing, continue the rebase process (`git rebase --continue`) until all commits are rebased.
