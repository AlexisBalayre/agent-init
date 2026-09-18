import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Mistral Vibe ships no config-validation command, but it is a Python package, so its own
 * loader can be asked directly whether our emitted hooks.toml is acceptable. This is the
 * only check that can refute the TOML shape; everything else is inference from its source.
 * Skipped wherever Vibe is not installed, which includes CI.
 */
function vibePython(): string | null {
  try {
    const bin = execFileSync("command", ["-v", "vibe"], { shell: "/bin/bash", encoding: "utf8" }).trim();
    const shebang = readFileSync(bin, "utf8").split("\n")[0] ?? "";
    const interpreter = shebang.replace(/^#!/, "").trim();
    return interpreter && existsSync(interpreter) ? interpreter : null;
  } catch {
    return null;
  }
}

const PYTHON = vibePython();
const TSX = path.resolve("node_modules/.bin/tsx");
const CLI = path.resolve("src/cli.ts");

describe.skipIf(PYTHON === null)("emitted Vibe config, checked by Vibe itself", () => {
  it("parses under Vibe's strict loader with no issues", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "agentspine-vibe-"));
    spawnSync("git", ["init", "-q"], { cwd: dir });
    mkdirSync(path.join(dir, ".vibe"));
    spawnSync(TSX, [CLI, "--dir", dir, "--yes", "--tools", "mistral-vibe"], { encoding: "utf8" });

    const script = `
import json, sys
from pathlib import Path
from vibe.core.hooks.config import load_hooks_file
result = load_hooks_file(Path(sys.argv[1]), strict=True)
print(json.dumps({
    "issues": [i.message for i in result.issues],
    "hooks": [{"name": h.name, "type": str(h.type), "match": h.match} for h in result.hooks],
}))
`;
    const out = spawnSync(PYTHON as string, ["-c", script, path.join(dir, ".vibe/hooks.toml")], {
      encoding: "utf8",
    });
    const parsed = JSON.parse(out.stdout) as {
      issues: string[];
      hooks: Array<{ name: string; type: string; match: string | null }>;
    };

    expect(parsed.issues).toEqual([]);
    expect(parsed.hooks.map((h) => h.type)).toEqual(["pre_tool", "post_agent"]);
    // Vibe rejects `match` on a non-tool hook, so the post_agent entry must not carry one.
    expect(parsed.hooks[1]?.match).toBeNull();
  });
});
