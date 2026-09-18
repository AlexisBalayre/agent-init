import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * `tsc` never removes outputs whose source is gone, so `dist/` accumulates whatever any branch
 * ever compiled, and `npm publish` ships the directory as it finds it. A real publish of 0.1.0
 * carried a compiled file that existed only on an unmerged branch. The build clears `dist/` first
 * for that reason, and this asserts it still does.
 */
describe("build", () => {
  it("drops artifacts whose source no longer exists", () => {
    const stale = path.resolve("dist/review/gone-from-src.js");
    mkdirSync(path.dirname(stale), { recursive: true });
    writeFileSync(stale, "export const leftBehind = true;\n");

    const build = spawnSync("npm", ["run", "build"], { encoding: "utf8" });
    expect(build.status, build.stderr).toBe(0);

    expect(existsSync(stale)).toBe(false);
    // The real outputs are still there: this is a clean build, not a broken one.
    expect(existsSync(path.resolve("dist/cli.js"))).toBe(true);
  });
});
