#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const TOOLS = ["claude-code", "codex", "opencode", "mistral-vibe", "cursor"] as const;
const PACKS = ["thinking", "engineering", "review"] as const;

const USAGE = `agent-init — one shared agent setup for ${TOOLS.length} coding agents

Usage
  npx agent-init [init]      Scaffold .agents/ and wire each detected tool
  npx agent-init doctor      Probe installed tools and verify hooks actually fire

Options
  --tools <list>     Comma-separated: ${TOOLS.join(", ")} (default: detected)
  --packs <list>     Comma-separated: ${PACKS.join(", ")} (default: none)
  --no-symlink       Copy content instead of symlinking it
  --force            Proceed on a dirty git tree
  -h, --help         Show this message
  -v, --version      Show version
`;

function version(): string {
  const pkg = fileURLToPath(new URL("../package.json", import.meta.url));
  return JSON.parse(readFileSync(pkg, "utf8")).version;
}

function main(argv: string[]): number {
  if (argv.includes("-h") || argv.includes("--help")) {
    process.stdout.write(USAGE);
    return 0;
  }
  if (argv.includes("-v") || argv.includes("--version")) {
    process.stdout.write(`${version()}\n`);
    return 0;
  }

  const command = argv.find((a) => !a.startsWith("-")) ?? "init";
  if (command !== "init" && command !== "doctor") {
    process.stderr.write(`Unknown command: ${command}\n\n${USAGE}`);
    return 1;
  }

  process.stderr.write(
    `agent-init ${command} is not implemented yet.\n` +
      `The design is settled — see docs/design/0001-architecture.md.\n`,
  );
  return 1;
}

process.exit(main(process.argv.slice(2)));
