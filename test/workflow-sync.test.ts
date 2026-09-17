import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error -- plain ESM script, no types
import { renderFromDisk } from "../scripts/render-review-workflow.mjs";

/**
 * This repository runs the workflow the ci-review pack emits, with three documented differences.
 * The copy we run is the evidence the one we ship works, so the two drifting apart would leave
 * that evidence quietly meaningless.
 */
describe("the repo's review workflow", () => {
  it("is what the template renders to", () => {
    const committed = readFileSync(path.resolve(".github/workflows/claude-code-review.yml"), "utf8");
    expect(renderFromDisk()).toBe(committed);
  });

  it("keeps the differences that make it safe to dogfood", () => {
    const committed = readFileSync(path.resolve(".github/workflows/claude-code-review.yml"), "utf8");
    // Built from the base branch: the PR head is the review tooling here, and building it would
    // run untrusted code in a job holding the review token.
    expect(committed).toContain("git worktree add --detach");
    expect(committed).not.toContain("npm install --global");
    // Only the owner triggers a run, and only once the switch is on.
    expect(committed).toContain("github.event.pull_request.user.login == github.repository_owner");
    expect(committed).toContain("vars.CLAUDE_REVIEW_ENABLED == 'true'");
    // `.agents/` is a symlink into templates/, so the target is startup config too.
    expect(committed).toContain('RESTORE_PATHS: "AGENTS.md .agents templates"');
  });
});
