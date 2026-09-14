import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

export const SUPPORTED_TOOLS = ["claude-code", "opencode"] as const;
export type Tool = (typeof SUPPORTED_TOOLS)[number];

export type Stack = { files: string; lintFix?: string; lint?: string; typecheck?: string };

const TOOL_MARKERS: Record<Tool, string[]> = {
  "claude-code": ["CLAUDE.md", ".claude"],
  opencode: ["opencode.json", ".opencode"],
};

const STACKS: Array<{ marker: string; stack: Stack }> = [
  {
    marker: "package.json",
    stack: {
      files: "\\.(ts|tsx)$",
      lintFix: "pnpm exec biome check --write",
      lint: "pnpm exec biome check",
      typecheck: "pnpm typecheck",
    },
  },
  {
    marker: "pyproject.toml",
    stack: { files: "\\.py$", lintFix: "ruff format", lint: "ruff check", typecheck: "mypy ." },
  },
  { marker: "go.mod", stack: { files: "\\.go$", lintFix: "gofmt -w", lint: "go vet ./...", typecheck: "" } },
  {
    marker: "Cargo.toml",
    stack: { files: "\\.rs$", lintFix: "cargo fmt --", lint: "cargo clippy -- -D warnings", typecheck: "cargo check" },
  },
];

export function detectTools(dir: string): Tool[] {
  return SUPPORTED_TOOLS.filter((tool) =>
    TOOL_MARKERS[tool].some((marker) => existsSync(path.join(dir, marker))),
  );
}

export function detectStacks(dir: string): Stack[] {
  return STACKS.filter(({ marker }) => existsSync(path.join(dir, marker))).map(({ stack }) => stack);
}

export function hasJq(): boolean {
  try {
    execFileSync("jq", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

export type GitState = { isRepo: boolean; isClean: boolean; root?: string };

export function gitState(dir: string): GitState {
  try {
    const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd: dir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    const status = execFileSync("git", ["status", "--porcelain"], { cwd: dir, encoding: "utf8" });
    return { isRepo: true, isClean: status.trim() === "", root };
  } catch {
    return { isRepo: false, isClean: false };
  }
}
