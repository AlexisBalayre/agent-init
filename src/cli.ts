#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SUPPORTED_TOOLS, detectStacks, detectTools, gitState, hasJq, type Tool } from "./detect.utils.js";
import { apply, describe } from "./apply.utils.js";
import { buildPlan } from "./plan.utils.js";

const TEMPLATES = fileURLToPath(new URL("../templates", import.meta.url));

const USAGE = `agent-init — one shared agent setup for several coding agents

Usage
  npx agent-init [init]      Scaffold .agents/ and wire each detected tool
  npx agent-init doctor      Probe the wiring and verify hooks actually block

Options
  --tools <list>     Comma-separated: ${SUPPORTED_TOOLS.join(", ")} (default: detected)
  --dir <path>       Target repository (default: cwd)
  --no-symlink       Copy shared content instead of symlinking it
  --skip-hooks       Scaffold content but wire no hooks
  --dry-run          Print the plan, write nothing
  --yes              Apply without confirming
  --json             Machine-readable output
  --force            Proceed even though the git tree is dirty
  -h, --help         Show this message
  -v, --version      Show version
`;

type Options = {
  command: "init" | "doctor";
  dir: string;
  tools?: Tool[];
  symlink: boolean;
  hooks: boolean;
  dryRun: boolean;
  yes: boolean;
  json: boolean;
  force: boolean;
  explicit: boolean;
};

function parse(argv: string[]): Options | { error: string } {
  const options: Options = {
    command: "init",
    dir: process.cwd(),
    symlink: true,
    hooks: true,
    dryRun: false,
    yes: false,
    json: false,
    force: false,
    explicit: argv.length > 0,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "init":
      case "doctor": options.command = arg; break;
      case "--no-symlink": options.symlink = false; break;
      case "--skip-hooks": options.hooks = false; break;
      case "--dry-run": options.dryRun = true; break;
      case "--yes": case "-y": options.yes = true; break;
      case "--json": options.json = true; break;
      case "--force": options.force = true; break;
      case "--dir": options.dir = path.resolve(argv[++i] ?? "."); break;
      case "--tools": {
        const value = argv[++i] ?? "";
        const requested = value.split(",").map((t) => t.trim()).filter(Boolean);
        const unknown = requested.filter((t) => !SUPPORTED_TOOLS.includes(t as Tool));
        if (unknown.length > 0) return { error: `Unsupported tool(s): ${unknown.join(", ")}` };
        options.tools = requested as Tool[];
        break;
      }
      default: return { error: `Unknown option: ${arg}` };
    }
  }

  return options;
}

async function init(options: Options): Promise<number> {
  const git = gitState(options.dir);
  const root = git.root ?? options.dir;

  if (git.isRepo && !git.isClean && !options.force && !options.dryRun) {
    fail(options, "The git tree is dirty. Commit or stash first, or pass --force. Git is your backup.");
    return 1;
  }

  const tools = options.tools ?? detectTools(root);
  if (tools.length === 0) {
    fail(options, `No supported tool detected in ${root}. Pass --tools ${SUPPORTED_TOOLS.join(",")}.`);
    return 1;
  }

  if (options.hooks && !hasJq()) {
    fail(options, "jq is not installed, and hook policies need it. Install jq (brew install jq / apt-get install jq), or re-run with --skip-hooks.");
    return 1;
  }

  const stacks = detectStacks(root);
  const interactive = process.stdin.isTTY === true && !options.explicit;
  const plan = buildPlan({
    root, templates: TEMPLATES, tools, stacks,
    symlink: options.symlink, hooks: options.hooks,
    confirmed: interactive,
  });

  if (options.json) {
    process.stdout.write(`${JSON.stringify({ root, tools, stacks, plan, applied: false }, null, 2)}\n`);
    if (options.dryRun) return 0;
  } else {
    process.stdout.write(`agent-init -> ${root}\ntools: ${tools.join(", ")}\n\n`);
    for (const action of plan) process.stdout.write(`  ${describe(action)}\n`);
    process.stdout.write("\n");
  }

  if (options.dryRun) return 0;

  if (!options.yes) {
    if (!interactive) {
      // Never guess on someone's repository without a human or an explicit --yes.
      fail(options, "Refusing to write without confirmation. Re-run with --yes, or --dry-run to inspect the plan.");
      return 2;
    }
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = (await rl.question("Apply this plan? [y/N] ")).trim().toLowerCase();
    rl.close();
    if (answer !== "y" && answer !== "yes") {
      process.stdout.write("Nothing written.\n");
      return 0;
    }
  }

  const applied = apply(plan, root);
  if (options.json) process.stdout.write(`${JSON.stringify({ root, tools, applied }, null, 2)}\n`);
  else {
    for (const entry of applied) process.stdout.write(`  ${entry.outcome.padEnd(14)}${entry.target}\n`);
    process.stdout.write(`\nDone. Verify with: npx agent-init doctor\n`);
  }
  return 0;
}

type Check = { name: string; ok: boolean; detail: string };

function doctor(options: Options): number {
  const root = gitState(options.dir).root ?? options.dir;
  // Only tools the project actually uses are checked: reporting a missing plugin for a
  // tool nobody installed trains people to ignore doctor's output.
  const tools = options.tools ?? detectTools(root);
  const checks: Check[] = [];

  checks.push({ name: "jq", ok: hasJq(), detail: hasJq() ? "installed" : "missing — hook policies cannot run" });

  const adapter = path.join(root, ".agents/hooks/adapters/claude-code.sh");
  const wired = existsSync(adapter);
  checks.push({ name: ".agents/hooks", ok: wired, detail: wired ? "present" : "not scaffolded" });

  if (wired && hasJq() && tools.includes("claude-code")) {
    // The only check that matters: a hook that fails to block exits 0 and looks healthy.
    const command = ["git", "push", "--force", "origin", "main"].join(" ");
    const probe = spawnSync("bash", [adapter, "git-safety"], {
      input: JSON.stringify({ hook_event_name: "PreToolUse", tool_name: "Bash", cwd: root, tool_input: { command } }),
      encoding: "utf8",
      env: { ...process.env, CLAUDE_PROJECT_DIR: root },
    });
    checks.push({
      name: "claude-code blocking",
      ok: probe.status === 2,
      detail: probe.status === 2 ? "probe blocked as expected" : `probe returned ${probe.status}; hooks are NOT blocking`,
    });
  }

  if (tools.includes("claude-code")) {
    const settings = path.join(root, ".claude/settings.json");
    const settingsWired = existsSync(settings) && readFileSync(settings, "utf8").includes(".agents/hooks/adapters");
    checks.push({
      name: "claude-code settings",
      ok: settingsWired,
      detail: settingsWired ? "hooks wired" : "no agent-init hooks found in .claude/settings.json",
    });
  }

  if (tools.includes("opencode")) {
    const plugin = path.join(root, ".opencode/plugins/agent-init.js");
    const pluginWired = existsSync(plugin);
    checks.push({
      name: "opencode plugin",
      ok: pluginWired,
      detail: pluginWired ? "present (not probed: needs a live opencode session)" : "not installed",
    });
  }

  if (tools.length === 0) {
    checks.push({ name: "tools", ok: false, detail: "no supported tool detected here" });
  }

  if (options.json) {
    process.stdout.write(`${JSON.stringify({ root, checks }, null, 2)}\n`);
  } else {
    process.stdout.write(`agent-init doctor -> ${root}\n\n`);
    for (const check of checks) {
      process.stdout.write(`  ${check.ok ? "ok  " : "FAIL"}  ${check.name.padEnd(22)}${check.detail}\n`);
    }
    process.stdout.write("\n");
  }

  return checks.every((check) => check.ok) ? 0 : 1;
}

function fail(options: Options, message: string) {
  if (options.json) process.stdout.write(`${JSON.stringify({ error: message }, null, 2)}\n`);
  else process.stderr.write(`agent-init: ${message}\n`);
}

async function main(argv: string[]): Promise<number> {
  if (argv.includes("-h") || argv.includes("--help")) {
    process.stdout.write(USAGE);
    return 0;
  }
  if (argv.includes("-v") || argv.includes("--version")) {
    const pkg = fileURLToPath(new URL("../package.json", import.meta.url));
    process.stdout.write(`${JSON.parse(readFileSync(pkg, "utf8")).version}\n`);
    return 0;
  }

  const parsed = parse(argv);
  if ("error" in parsed) {
    process.stderr.write(`agent-init: ${parsed.error}\n\n${USAGE}`);
    return 1;
  }

  return parsed.command === "doctor" ? doctor(parsed) : init(parsed);
}

process.exit(await main(process.argv.slice(2)));
