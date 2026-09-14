import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ADAPTER = path.resolve("templates/agents/hooks/adapters/claude-code.sh");
const FIXTURES = path.resolve("test/fixtures/claude-code");

/** Runs the adapter exactly as Claude Code does: payload on stdin, policy name as argv. */
function runAdapter(fixture: string, policy: string) {
  const payload = readFileSync(path.join(FIXTURES, fixture), "utf8");
  const projectDir = mkdtempSync(path.join(tmpdir(), "agent-init-"));

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
    expect(stderr).toContain("BLOCKED by agent-init git-safety");
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
