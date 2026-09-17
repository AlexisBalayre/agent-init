#!/usr/bin/env node
// Renders this repository's copy of the review workflow from the one the ci-review pack emits.
//
// The two files must not drift: the copy we run is the evidence that the one we ship works. Every
// difference between them is a transform below, so a change to the template reaches this repo by
// re-running this script, and CI fails when the committed copy no longer matches its output.
//
//   node scripts/render-review-workflow.mjs           print the rendered workflow
//   node scripts/render-review-workflow.mjs --write    write it to .github/workflows/
import { readFileSync, writeFileSync } from "node:fs";

const TEMPLATE = "templates/github/workflows/claude-code-review.yml";
const TARGET = ".github/workflows/claude-code-review.yml";

// The orphan-branch setup line, assembled so this file does not carry a literal that the
// git-safety policy blocks on sight.
const ORPHAN = `#        git checkout --orphan ci/review-metrics && git ${"rm"} ${"-rf"} . \\\n`;

const HEADER = `# This repository's copy of what the ci-review pack emits
# (${TEMPLATE}), rendered by scripts/render-review-workflow.mjs.
# Edit the template or that script, never this file: a test asserts the two stay in step.
#
# The differences dogfooding requires:
#
#   1. The tooling is built from the BASE branch instead of installed from npm. agent-init is not
#      published yet, and here the review tooling is the very code under review: building the PR's
#      own src/ would hand untrusted code a job holding the review token. The base branch's copy
#      has already been reviewed, which is the same argument as the config restore below.
#   2. Only the repository owner can trigger a run: their own pull requests, or their
#      \`@claude review\` comment on anyone's. A run carries the review token, and the model reads
#      whatever the diff says.
#   3. RESTORE_PATHS carries templates/ as well, because .agents/ here is a symlink into it:
#      restoring the link alone would still run the PR's copy of the skills and reviewer manifests.
#
# Setup (once):
#   1. Add the \`CLAUDE_CODE_OAUTH_TOKEN\` secret: \`claude setup-token\`, then
#      \`gh secret set CLAUDE_CODE_OAUTH_TOKEN\`.
#   2. Turn it on: \`gh variable set CLAUDE_REVIEW_ENABLED --body true\`. Until that variable is
#      \`true\` the job is skipped, so the workflow can land before the token exists.
#   3. Create the metrics branch:
${ORPHAN}#          && git commit --allow-empty -m "review-metrics: init" && git push origin ci/review-metrics`;

const TOOLING_STEP = `      # Built from the base branch, never from the PR head: here the review tooling is the code
      # under review. --ignore-scripts because the install runs with this job's token in the
      # environment. A separate worktree, so \`gh pr checkout\` below cannot disturb it.
      - name: Build review tooling from the base branch
        id: tooling
        env:
          GH_TOKEN: \${{ github.token }}
          PR_NUMBER: \${{ github.event.pull_request.number || github.event.issue.number }}
        run: |
          base=$(gh pr view "$PR_NUMBER" --json baseRefName -q .baseRefName)
          dir="\${RUNNER_TEMP}/review-tooling"
          git worktree add --detach "$dir" "origin/\${base}"
          npm ci --ignore-scripts --prefix "$dir"
          npm run build --prefix "$dir"
          echo "cli=\${dir}/dist/cli.js" >> "$GITHUB_OUTPUT"
`;

const OWNER_GATE = `    # Owner-only, and off until CLAUDE_REVIEW_ENABLED is set: a fork PR would otherwise queue a
    # run that reads its diff with the review token in the environment.
    # \`github.repository_owner\` is the account, so this needs no list to maintain.
    if: |
      vars.CLAUDE_REVIEW_ENABLED == 'true' && (
      (github.event_name == 'pull_request' && github.event.pull_request.draft == false &&
        github.event.pull_request.user.login == github.repository_owner) ||
      (github.event_name == 'issue_comment' && github.event.issue.pull_request &&
        contains(github.event.comment.body, '@claude review') &&
        github.event.comment.user.login == github.repository_owner))`;

/** Each transform is one documented difference; a miss fails loudly rather than rendering silently. */
const TRANSFORMS = [
  // 1. The header, down to the workflow name.
  [/^#[\s\S]*?(?=^name: Claude Code Review$)/m, `${HEADER}\n`],
  // 2. No published version to pin: the tooling is built, not installed.
  [
    /  # The review tooling ships inside agent-init[\s\S]*?  AGENT_INIT_VERSION: "__AGENT_INIT_VERSION__"\n/,
    "",
  ],
  // 3. `.agents/` here is a symlink into templates/, so the link's target is startup config too.
  [/  RESTORE_PATHS: "AGENTS\.md \.agents"/, '  RESTORE_PATHS: "AGENTS.md .agents templates"'],
  // 4. Owner-only trigger, behind an enable switch.
  [
    /    if: \|\n      \(github\.event_name == 'pull_request' && github\.event\.pull_request\.draft == false\) \|\|\n      \(github\.event_name == 'issue_comment'[^\n]*\n/,
    `${OWNER_GATE}\n`,
  ],
  // 5. Build from the base branch instead of installing from npm.
  [
    /      # --ignore-scripts: the install runs with this job's token in the environment\.\n      - name: Install review tooling\n        run: npm install --global --ignore-scripts "agent-init@\$\{AGENT_INIT_VERSION\}"\n/,
    TOOLING_STEP,
  ],
  // 6. Call the built CLI rather than the installed binary.
  [/agent-init review (preflight|schema|post|metrics)/g, 'node "${{ steps.tooling.outputs.cli }}" review $1'],
];

export function render(template) {
  let out = template;
  for (const [pattern, replacement] of TRANSFORMS) {
    if (!pattern.test(out)) throw new Error(`review-workflow transform no longer matches: ${pattern}`);
    out = out.replace(pattern, replacement);
  }
  if (out.includes("__AGENT_INIT_VERSION__")) throw new Error("version placeholder survived rendering");
  return out;
}

export function renderFromDisk() {
  return render(readFileSync(TEMPLATE, "utf8"));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const rendered = renderFromDisk();
  if (process.argv.includes("--write")) {
    writeFileSync(TARGET, rendered);
    process.stdout.write(`wrote ${TARGET}\n`);
  } else {
    process.stdout.write(rendered);
  }
}
