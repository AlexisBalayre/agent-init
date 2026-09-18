import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const CREATE = path.resolve("templates/agents/scripts/worktree-create.sh");
const CLEAN = path.resolve("templates/agents/scripts/worktree-clean.sh");
const TSX = path.resolve("node_modules/.bin/tsx");
const CLI = path.resolve("src/cli.ts");

function git(cwd: string, ...args: string[]) {
  return spawnSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...args], { cwd, encoding: "utf8" });
}

/** A committed repository with a bare origin, so branches can be published and deleted. */
function repoWithOrigin(worktreeEnv?: string) {
  const base = mkdtempSync(path.join(tmpdir(), "agentspine-wt-"));
  const origin = path.join(base, "origin.git");
  const repo = path.join(base, "repo");
  spawnSync("git", ["init", "-q", "--bare", origin]);
  spawnSync("git", ["init", "-q", "-b", "main", repo]);
  writeFileSync(path.join(repo, "README.md"), "demo\n");
  if (worktreeEnv !== undefined) {
    mkdirSync(path.join(repo, ".agents"));
    writeFileSync(path.join(repo, ".agents", "worktree.env"), worktreeEnv);
  }
  git(repo, "add", "-A");
  git(repo, "commit", "-qm", "init");
  git(repo, "remote", "add", "origin", origin);
  return repo;
}

function run(script: string, cwd: string, ...args: string[]) {
  const result = spawnSync("bash", [script, ...args], { cwd, encoding: "utf8" });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

describe("worktree scripts", () => {
  it("creates a worktree on a prefixed branch and runs the install command inside it", () => {
    const repo = repoWithOrigin('WORKTREE_INSTALL="touch installed"\n');
    const { status } = run(CREATE, repo, "search");
    expect(status).toBe(0);
    expect(git(path.join(repo, ".worktrees/search"), "branch", "--show-current").stdout.trim()).toBe("feature/search");
    expect(existsSync(path.join(repo, ".worktrees/search/installed"))).toBe(true);
  });

  it("works with no config at all", () => {
    const repo = repoWithOrigin();
    expect(run(CREATE, repo, "plain").status).toBe(0);
    expect(existsSync(path.join(repo, ".worktrees/plain"))).toBe(true);
  });

  it("refuses to reuse an existing worktree name", () => {
    const repo = repoWithOrigin();
    run(CREATE, repo, "twice");
    const { status, stderr } = run(CREATE, repo, "twice");
    expect(status).toBe(1);
    expect(stderr).toContain("already exists");
  });

  it("fails loudly when the install command fails, rather than leaving a half-ready worktree unannounced", () => {
    const repo = repoWithOrigin('WORKTREE_INSTALL="false"\n');
    expect(run(CREATE, repo, "broken").status).not.toBe(0);
  });

  it("removes only prefixed worktrees whose remote branch is gone", () => {
    const repo = repoWithOrigin();
    run(CREATE, repo, "merged");
    run(CREATE, repo, "open");
    git(repo, "push", "-q", "origin", "feature/merged", "feature/open");
    git(repo, "push", "-q", "origin", "--delete", "feature/merged");
    git(repo, "worktree", "add", "-q", ".worktrees/other", "-b", "spike/other");

    const { status } = run(CLEAN, repo);
    expect(status).toBe(0);
    expect(existsSync(path.join(repo, ".worktrees/merged"))).toBe(false);
    expect(existsSync(path.join(repo, ".worktrees/open"))).toBe(true);
    expect(existsSync(path.join(repo, ".worktrees/other"))).toBe(true);
  });
});

describe("init emits the worktree setup", () => {
  it("installs executable scripts, a config to fill, and ignores the worktree directory", () => {
    const repo = repoWithOrigin();
    mkdirSync(path.join(repo, ".claude"));
    writeFileSync(path.join(repo, ".gitignore"), "node_modules/\n");
    git(repo, "add", "-A");
    git(repo, "commit", "-qm", "tools");
    spawnSync(TSX, [CLI, "--dir", repo, "--yes", "--skip-hooks"], { encoding: "utf8" });

    expect(statSync(path.join(repo, ".agents/scripts/worktree-create.sh")).mode & 0o111).not.toBe(0);
    expect(existsSync(path.join(repo, ".agents/worktree.env"))).toBe(true);
    const ignore = readFileSync(path.join(repo, ".gitignore"), "utf8");
    expect(ignore).toContain("node_modules/");
    expect(ignore).toMatch(/^\.worktrees\/$/m);
  });
});
