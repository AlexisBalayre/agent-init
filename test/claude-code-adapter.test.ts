import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ADAPTER = path.resolve("templates/agents/hooks/adapters/claude-code.sh");
const FIXTURES = path.resolve("test/fixtures/claude-code");

/** Runs the adapter exactly as Claude Code does: payload on stdin, policy name as argv. */
function runAdapter(fixture: string, policy: string) {
  const payload = readFileSync(path.join(FIXTURES, fixture), "utf8");
  const projectDir = mkdtempSync(path.join(tmpdir(), "agentspine-"));

  const result = spawnSync("bash", [ADAPTER, policy], {
    input: payload,
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir },
  });

  return { status: result.status, stderr: result.stderr };
}

describe("claude-code adapter -> git-safety", () => {
  it("blocks a force push with exit 2 and a reason on stderr", () => {
    const { status, stderr } = runAdapter("pre-tool-bash.force-push.json", "git-safety");
    expect(status).toBe(2);
    expect(stderr).toContain("BLOCKED by agentspine git-safety");
  });

  it("allows an ordinary command", () => {
    expect(runAdapter("pre-tool-bash.benign.json", "git-safety").status).toBe(0);
  });

  // A hand-rolled shell JSON extractor mis-reads this and lets the force push through;
  // the embedded quotes, brace and nested "command" key exist to defeat exactly that.
  it("still blocks when the command embeds quotes, braces and a decoy key", () => {
    const { status } = runAdapter("pre-tool-bash.quoted-command.json", "git-safety");
    expect(status).toBe(2);
  });

  it("ignores tools other than Bash", () => {
    expect(runAdapter("pre-tool-read.json", "git-safety").status).toBe(0);
  });
});

describe("claude-code adapter -> quality-gate", () => {
  it("is a no-op at turn-end when the project has no quality.toml", () => {
    expect(runAdapter("turn-end.json", "quality-gate").status).toBe(0);
  });
});

describe("adapter safety", () => {
  it("never blocks because of its own misconfiguration", () => {
    const { status } = runAdapter("pre-tool-bash.force-push.json", "no-such-policy");
    expect(status).toBe(0);
  });
});

/**
 * A worktree is a second checkout of the same repository on its own branch. The hook is handed the
 * repository root as the project dir and the worktree as the session's cwd, so reading the root's
 * branch blocks every commit made from a worktree whenever the root happens to sit on trunk. That
 * is not hypothetical: it blocked the commit that introduced this test.
 */
describe("git-safety across worktrees", () => {
  function repoWithWorktree() {
    const root = mkdtempSync(path.join(tmpdir(), "agentspine-wt-safety-"));
    const git = (cwd: string, ...args: string[]) =>
      spawnSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...args], { cwd, encoding: "utf8" });
    git(root, "init", "-q", "-b", "main");
    writeFileSync(path.join(root, "a.txt"), "x\n");
    git(root, "add", "-A");
    git(root, "commit", "-qm", "init");
    const tree = path.join(root, ".worktrees", "feature");
    git(root, "worktree", "add", "-q", tree, "-b", "feat/thing");
    return { root, tree };
  }

  function runFromCwd(projectDir: string, cwd: string) {
    const payload = JSON.stringify({
      hook_event_name: "PreToolUse",
      tool_name: "Bash",
      cwd,
      tool_input: { command: ["git", "commit", "-m", "work"].join(" ") },
    });
    return spawnSync("bash", [ADAPTER, "git-safety"], {
      input: payload,
      encoding: "utf8",
      env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir },
    });
  }

  it("allows a commit from a worktree while the root sits on trunk", () => {
    const { root, tree } = repoWithWorktree();
    expect(runFromCwd(root, tree).status).toBe(0);
  });

  it("still blocks a commit made in the root while it is on trunk", () => {
    const { root } = repoWithWorktree();
    const result = runFromCwd(root, root);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("Branch first");
  });
});
