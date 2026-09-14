import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ADAPTER = path.resolve("templates/agents/hooks/adapters/claude-code.sh");
const TURN_END = readFileSync(path.resolve("test/fixtures/claude-code/turn-end.json"), "utf8");

/** A throwaway repository with one dirty file and the given gate config. */
function projectWithGate(gate: string, dirtyFile = "a.ts") {
  const dir = mkdtempSync(path.join(tmpdir(), "agent-init-gate-"));
  spawnSync("git", ["init", "-q"], { cwd: dir });
  writeFileSync(path.join(dir, dirtyFile), "export const x = 1;\n");
  mkdirSync(path.join(dir, ".agents"));
  writeFileSync(path.join(dir, ".agents", "quality.toml"), gate);
  return dir;
}

function runGate(dir: string) {
  const result = spawnSync("bash", [ADAPTER, "quality-gate"], {
    input: TURN_END,
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
  });
  return { status: result.status, stderr: result.stderr };
}

describe("quality gate", () => {
  // Regression: a regex written as a TOML basic string arrived with its backslashes
  // doubled, matched nothing, and the gate reported success while running no checks.
  // A gate that silently passes is the exact failure this project exists to prevent.
  it("runs the configured command when a dirty file matches", () => {
    const dir = projectWithGate("[[gate]]\nfiles = '\\.ts$'\nlint = \"false\"\n");
    expect(runGate(dir).status).toBe(2);
  });

  it("passes when the configured command succeeds", () => {
    const dir = projectWithGate("[[gate]]\nfiles = '\\.ts$'\nlint = \"true\"\n");
    expect(runGate(dir).status).toBe(0);
  });

  it("skips gates whose file pattern matches nothing", () => {
    const dir = projectWithGate("[[gate]]\nfiles = '\\.py$'\nlint = \"false\"\n");
    expect(runGate(dir).status).toBe(0);
  });

  it("restricts a gate to its paths", () => {
    const dir = projectWithGate("[[gate]]\npaths = 'services/'\nfiles = '\\.ts$'\nlint = \"false\"\n");
    expect(runGate(dir).status).toBe(0);
  });

  it("is a no-op when the project has no gate config", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "agent-init-nogate-"));
    spawnSync("git", ["init", "-q"], { cwd: dir });
    expect(runGate(dir).status).toBe(0);
  });
});
