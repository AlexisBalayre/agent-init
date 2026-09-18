import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SKILLS = path.resolve("templates/agents/skills");

/**
 * A skill is user-invoked when its frontmatter says so. Claude Code and Cursor honour that key;
 * Codex ignores it and reads `agents/openai.yaml` beside the SKILL.md instead. Codex warns and
 * ignores a file it cannot parse, and an ignored file means implicit invocation is back on, so the
 * contents are asserted exactly rather than assumed to be well-formed.
 */
const CODEX_POLICY = "policy:\n  allow_implicit_invocation: false\n";

function skills() {
  return readdirSync(SKILLS, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

function frontmatter(skill: string): string {
  const text = readFileSync(path.join(SKILLS, skill, "SKILL.md"), "utf8");
  return /^---\n(.*?)\n---\n/s.exec(text)?.[1] ?? "";
}

const userInvoked = (skill: string) => /^disable-model-invocation:\s*true\s*$/m.test(frontmatter(skill));

describe("user-invoked skills carry Codex's equivalent switch", () => {
  it("has user-invoked skills to check", () => {
    expect(skills().filter(userInvoked).length).toBeGreaterThan(0);
  });

  it.each(skills())("%s", (skill) => {
    const policy = path.join(SKILLS, skill, "agents", "openai.yaml");
    if (!userInvoked(skill)) {
      // A model-invoked skill must stay reachable by the model on every host.
      expect(existsSync(policy), `${skill} is model-invoked but carries a Codex opt-out`).toBe(false);
      return;
    }
    expect(existsSync(policy), `${skill} is user-invoked but Codex would still fire it`).toBe(true);
    const contents = readFileSync(policy, "utf8");
    // Comments are free; the two payload lines are not, and a typo in them fails open.
    const payload = contents
      .split("\n")
      .filter((line) => line.trim() !== "" && !line.trimStart().startsWith("#"))
      .join("\n");
    expect(`${payload}\n`).toBe(CODEX_POLICY);
  });
});
