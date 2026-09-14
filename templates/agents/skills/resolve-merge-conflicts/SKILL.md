---
name: resolve-merge-conflicts
description: Resolve an in-progress git merge or rebase conflict. Use when a merge, rebase, or cherry-pick stops on conflicts.
---

# Resolve Merge Conflicts

1. **See the current state** of the merge/rebase: `git status`, the history of both sides, and the conflicting files.

2. **Find the primary sources** for each conflict. Understand deeply why each change was made and what the original intent was. Read the commit messages and the PRs (`gh pr view`); if a PR body references a tracker issue, fetch it when the intent is still unclear.

3. **Resolve each hunk.** Preserve both intents where possible. Where incompatible, pick the one matching the merge's stated goal and note the trade-off. Do **not** invent new behaviour. Always resolve; never `--abort`.

4. **Regenerate, don't hand-merge.** Conflict markers in generated files are never resolved by hand. Identify every generated artifact in the conflict set and re-run its generator against the merged sources:
   - **Lockfiles**: take either side wholesale, then re-run the install command to regenerate.
   - **Migrations**: drop this branch's generated migration, regenerate it against the merged schema, then format the result. Never hand-edit a migration journal or checksum.
   - **Anything else with a generator** (client stubs, schema diagrams, API references): re-run the generator; never edit the output.

5. **Run the tests** for the affected packages and fix anything the merge broke. Failures that already exist on the base branch are not the merge's fault — verify that before spending time on them, and skip verification hooks only for those.

6. **Finish the merge/rebase.** Stage everything and commit. If rebasing, continue (`git rebase --continue`) until all commits are rebased.
