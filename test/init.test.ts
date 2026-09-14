import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

const TSX = path.resolve("node_modules/.bin/tsx");
const CLI = path.resolve("src/cli.ts");

function runCli(args: string[]) {
  const result = spawnSync(TSX, [CLI, ...args], { encoding: "utf8" });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

/** A repository shaped like the common case: existing agent config the user cares about. */
function demoRepo({ commit = true } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), "agent-init-cli-"));
  spawnSync("git", ["init", "-q"], { cwd: dir });
  writeFileSync(path.join(dir, "package.json"), '{ "name": "demo" }\n');
  writeFileSync(path.join(dir, "AGENTS.md"), "# Demo\n\nOur house rules.\n");
  mkdirSync(path.join(dir, ".claude"));
  writeFileSync(
    path.join(dir, ".claude", "settings.json"),
    '{\n  "permissions": { "allow": ["Bash(ls:*)"] }\n}\n',
  );
  if (commit) {
    spawnSync("git", ["add", "-A"], { cwd: dir });
    spawnSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "init"], { cwd: dir });
  }
  return dir;
}

let repo: string;
beforeEach(() => {
  repo = demoRepo();
});

describe("init", () => {
  it("writes nothing on a dry run", () => {
    const { status } = runCli(["--dir", repo, "--dry-run"]);
    expect(status).toBe(0);
    expect(existsSync(path.join(repo, ".agents"))).toBe(false);
  });

  it("refuses a dirty tree without --force", () => {
    writeFileSync(path.join(repo, "dirty.txt"), "x");
    const { status, stderr } = runCli(["--dir", repo, "--yes"]);
    expect(status).toBe(1);
    expect(stderr).toContain("dirty");
  });

  // Non-interactive without --yes must never guess on someone's repository.
  it("refuses to write unconfirmed when there is no TTY", () => {
    const { status } = runCli(["--dir", repo]);
    expect(status).toBe(2);
    expect(existsSync(path.join(repo, ".agents"))).toBe(false);
  });

  it("keeps the user's prose and adds a single managed block", () => {
    runCli(["--dir", repo, "--yes"]);
    const agents = readFileSync(path.join(repo, "AGENTS.md"), "utf8");
    expect(agents).toContain("Our house rules.");
    expect(agents.match(/agent-init:start/g)).toHaveLength(1);
  });

  it("merges into settings.json without discarding the user's keys", () => {
    runCli(["--dir", repo, "--yes"]);
    const settings = JSON.parse(readFileSync(path.join(repo, ".claude/settings.json"), "utf8"));
    expect(settings.permissions.allow).toEqual(["Bash(ls:*)"]);
    expect(settings.hooks.PreToolUse).toHaveLength(1);
  });

  it("is idempotent: a second run duplicates nothing", () => {
    runCli(["--dir", repo, "--yes"]);
    runCli(["--dir", repo, "--yes", "--force"]);
    const agents = readFileSync(path.join(repo, "AGENTS.md"), "utf8");
    const settings = JSON.parse(readFileSync(path.join(repo, ".claude/settings.json"), "utf8"));
    expect(agents.match(/agent-init:start/g)).toHaveLength(1);
    expect(settings.hooks.PreToolUse).toHaveLength(1);
    expect(settings.hooks.Stop).toHaveLength(1);
  });

  // Decision 10: a gate the user believes is running but is not is worse than an unfinished one.
  it("leaves inferred gate commands commented out", () => {
    runCli(["--dir", repo, "--yes"]);
    const gate = readFileSync(path.join(repo, ".agents/quality.toml"), "utf8");
    expect(gate).toContain("# lint =");
    expect(gate).not.toMatch(/^lint =/m);
  });

  it("symlinks skills by default and copies with --no-symlink", () => {
    runCli(["--dir", repo, "--yes"]);
    expect(lstatSync(path.join(repo, ".claude/skills")).isSymbolicLink()).toBe(true);

    const other = demoRepo();
    runCli(["--dir", other, "--yes", "--no-symlink"]);
    expect(lstatSync(path.join(other, ".claude/skills")).isSymbolicLink()).toBe(false);
  });

  it("rejects an unsupported tool by name", () => {
    const { status, stderr } = runCli(["--dir", repo, "--tools", "cursor", "--yes"]);
    expect(status).toBe(1);
    expect(stderr).toContain("Unsupported tool");
  });
});

describe("doctor", () => {
  it("fails before anything is scaffolded and passes afterwards", () => {
    expect(runCli(["doctor", "--dir", repo]).status).toBe(1);
    runCli(["--dir", repo, "--yes"]);
    const after = runCli(["doctor", "--dir", repo]);
    expect(after.status).toBe(0);
    expect(after.stdout).toContain("probe blocked as expected");
  });
});
