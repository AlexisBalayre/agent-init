import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

const TSX = path.resolve("node_modules/.bin/tsx");
const CLI = path.resolve("src/cli.ts");

function repo() {
  const dir = mkdtempSync(path.join(tmpdir(), "agent-init-link-"));
  spawnSync("git", ["init", "-q", "-b", "main", dir]);
  writeFileSync(path.join(dir, "package.json"), '{ "name": "demo" }\n');
  mkdirSync(path.join(dir, ".claude"));
  writeFileSync(path.join(dir, ".claude", "settings.json"), "{}\n");
  spawnSync("git", ["add", "-A"], { cwd: dir });
  spawnSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "init"], { cwd: dir });
  return dir;
}

const runCli = (args: string[]) => spawnSync(TSX, [CLI, ...args], { encoding: "utf8" });

describe("a host that cannot make symlinks", () => {
  /**
   * Windows without Developer Mode refuses symlinkSync. Silently leaving the link out would
   * make every skill invisible to the tool that reads through it, which is the failure this
   * project exists to avoid, so the content is copied instead and the outcome says so.
   */
  it("copies the shared tree instead, and says that is what happened", async () => {
    vi.resetModules();
    vi.doMock("node:fs", async (importOriginal) => {
      const real = await importOriginal<typeof import("node:fs")>();
      return {
        ...real,
        default: real,
        symlinkSync: () => {
          const error = new Error("EPERM: operation not permitted, symlink") as NodeJS.ErrnoException;
          error.code = "EPERM";
          throw error;
        },
      };
    });
    const { apply } = await import("../src/apply.utils.js");

    const dir = repo();
    const shared = path.join(dir, ".agents", "skills", "tdd");
    mkdirSync(shared, { recursive: true });
    writeFileSync(path.join(shared, "SKILL.md"), "---\nname: tdd\n---\n");

    const [applied] = apply([{ kind: "symlink", target: ".claude/skills", to: "../.agents/skills" }], dir);

    expect(applied?.outcome).toMatch(/copied/);
    expect(applied?.outcome).toMatch(/symlink/i);
    const copied = path.join(dir, ".claude/skills/tdd/SKILL.md");
    expect(existsSync(copied)).toBe(true);
    expect(lstatSync(path.join(dir, ".claude/skills")).isSymbolicLink()).toBe(false);
    expect(readFileSync(copied, "utf8")).toBe("---\nname: tdd\n---\n");
    vi.doUnmock("node:fs");
    vi.resetModules();
  });

  // The drift gate compares content elsewhere; a copy standing in for a link must pass too,
  // or --check would fail forever on exactly the machines that needed the fallback.
  it("is not drift: --check passes on a tree that copied instead of linking", () => {
    const dir = repo();
    runCli(["--dir", dir, "--yes", "--no-symlink", "--skip-hooks", "--packs", "engineering"]);
    expect(lstatSync(path.join(dir, ".claude/skills")).isSymbolicLink()).toBe(false);

    const { status, stdout } = runCli(["--dir", dir, "--check", "--skip-hooks", "--packs", "engineering"]);
    expect(stdout).toContain("matches what init would emit");
    expect(status).toBe(0);
  });

  it("still reports drift when the copy's content differs", () => {
    const dir = repo();
    runCli(["--dir", dir, "--yes", "--no-symlink", "--skip-hooks", "--packs", "engineering"]);
    writeFileSync(path.join(dir, ".claude/skills/tdd/SKILL.md"), "tampered\n");

    const { status, stdout } = runCli(["--dir", dir, "--check", "--skip-hooks", "--packs", "engineering"]);
    expect(status).toBe(1);
    expect(stdout).toContain(".claude/skills");
  });
});

describe("doctor checks the skills a tool would actually read", () => {
  it("fails when the link is there but resolves to nothing", () => {
    const dir = repo();
    runCli(["--dir", dir, "--yes", "--skip-hooks", "--packs", "engineering"]);
    // A link materialised as a text file, or a shared tree that never arrived, looks exactly
    // like this from the tool's side: a path that leads nowhere.
    rmSync(path.join(dir, ".agents/skills"), { recursive: true, force: true });

    const { status, stdout } = runCli(["--dir", dir, "doctor", "--tools", "claude-code"]);
    expect(stdout).toMatch(/skills/);
    expect(stdout).toMatch(/FAIL/);
    expect(status).not.toBe(0);
  });

  it("passes when the skills resolve", () => {
    const dir = repo();
    runCli(["--dir", dir, "--yes", "--skip-hooks", "--packs", "engineering"]);
    const { stdout } = runCli(["--dir", dir, "doctor", "--tools", "claude-code"]);
    expect(stdout).toMatch(/ok.*claude-code skills/);
  });

  it("passes when the skills were copied rather than linked", () => {
    const dir = repo();
    runCli(["--dir", dir, "--yes", "--no-symlink", "--skip-hooks", "--packs", "engineering"]);
    const { stdout } = runCli(["--dir", dir, "doctor", "--tools", "claude-code"]);
    expect(stdout).toMatch(/ok.*claude-code skills/);
  });
});

/** Guards the fixture above: a real symlink is still what a capable host gets. */
describe("a host that can make symlinks", () => {
  it("links, and the link resolves to the shared tree", () => {
    const dir = repo();
    runCli(["--dir", dir, "--yes", "--skip-hooks", "--packs", "engineering"]);
    const link = path.join(dir, ".claude/skills");
    expect(lstatSync(link).isSymbolicLink()).toBe(true);
    expect(existsSync(path.join(link, "tdd/SKILL.md"))).toBe(true);
    symlinkSync; // referenced so the import is not pruned by lint
  });
});
