#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SUPPORTED_TOOLS, detectStacks, detectTools, gitState, hasJq, type Tool } from "./detect.utils.js";
import { apply, describe } from "./apply.utils.js";
import { PACKS, buildPlan, type Pack } from "./plan.utils.js";

const TEMPLATES = fileURLToPath(new URL("../templates", import.meta.url));

const USAGE = `agent-init — one shared agent setup for several coding agents

Usage
  npx agent-init [init]      Scaffold .agents/ and wire each detected tool
  npx agent-init doctor      Probe the wiring and verify hooks actually block

Options
  --tools <list>     Comma-separated: ${SUPPORTED_TOOLS.join(", ")} (default: detected)
  --packs <list>     Skill packs to install: ${Object.keys(PACKS).join(", ")} (default: none)
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
  packs: Pack[];
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
    packs: [],
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
      case "--packs": {
        const value = argv[++i] ?? "";
        const requested = value.split(",").map((p) => p.trim()).filter(Boolean);
        const unknown = requested.filter((p) => !(p in PACKS));
        if (unknown.length > 0) return { error: `Unknown pack(s): ${unknown.join(", ")}` };
        options.packs = requested as Pack[];
        break;
      }
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
    packs: options.packs,
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

/** A payload shaped like the host's own, carrying a command git-safety must refuse. */
const PROBE_COMMAND = ["git", "push", "--force", "origin", "main"].join(" ");

type Probe = { adapter: string; payload: (root: string) => unknown; blocked: (status: number | null, stdout: string) => boolean };

const PROBES: Partial<Record<Tool, Probe>> = {
  "claude-code": {
    adapter: "claude-code.sh",
    payload: (root) => ({ hook_event_name: "PreToolUse", tool_name: "Bash", cwd: root, tool_input: { command: PROBE_COMMAND } }),
    blocked: (status) => status === 2,
  },
  codex: {
    adapter: "codex.sh",
    payload: (root) => ({ hook_event_name: "PreToolUse", tool_name: "Bash", cwd: root, tool_input: { command: PROBE_COMMAND } }),
    blocked: (status) => status === 2,
  },
  cursor: {
    adapter: "cursor.sh",
    payload: (root) => ({ hook_event_name: "beforeShellExecution", command: PROBE_COMMAND, cwd: root, workspace_roots: [root] }),
    blocked: (status) => status === 2,
  },
  // Vibe denies by exiting 0 and printing a decision, so a zero exit proves nothing here.
  "mistral-vibe": {
    adapter: "mistral-vibe.sh",
    payload: (root) => ({ hook_event_name: "pre_tool", tool_name: "shell", cwd: root, tool_input: { command: PROBE_COMMAND } }),
    blocked: (status, stdout) => {
      if (status !== 0) return false;
      try {
        return (JSON.parse(stdout) as { decision?: string }).decision === "deny";
      } catch {
        return false;
      }
    },
  },
};

const WIRING: Record<Tool, { file: string; needle: string }> = {
  "claude-code": { file: ".claude/settings.json", needle: ".agents/hooks/adapters" },
  opencode: { file: ".opencode/plugins/agent-init.js", needle: "" },
  codex: { file: ".codex/config.toml", needle: ".agents/hooks/adapters" },
  "mistral-vibe": { file: ".vibe/hooks.toml", needle: ".agents/hooks/adapters" },
  cursor: { file: ".cursor/hooks.json", needle: ".agents/hooks/adapters" },
};

function doctor(options: Options): number {
  const root = gitState(options.dir).root ?? options.dir;
  // Only tools the project actually uses are checked: reporting a missing plugin for a
  // tool nobody installed trains people to ignore doctor's output.
  const tools = options.tools ?? detectTools(root);
  const checks: Check[] = [];

  const jq = hasJq();
  checks.push({ name: "jq", ok: jq, detail: jq ? "installed" : "missing — hook policies cannot run" });

  const hooksDir = existsSync(path.join(root, ".agents/hooks"));
  checks.push({ name: ".agents/hooks", ok: hooksDir, detail: hooksDir ? "present" : "not scaffolded" });

  if (tools.length === 0) checks.push({ name: "tools", ok: false, detail: "no supported tool detected here" });

  for (const tool of tools) {
    const wiring = WIRING[tool];
    const file = path.join(root, wiring.file);
    const wired = existsSync(file) && (wiring.needle === "" || readFileSync(file, "utf8").includes(wiring.needle));
    checks.push({ name: `${tool} wiring`, ok: wired, detail: wired ? `wired in ${wiring.file}` : `not wired in ${wiring.file}` });

    const probe = PROBES[tool];
    if (!probe) {
      checks.push({ name: `${tool} blocking`, ok: true, detail: "not probed: needs a live session" });
      continue;
    }
    if (!hooksDir || !jq) continue;

    const adapter = path.join(root, ".agents/hooks/adapters", probe.adapter);
    // The only check that matters: a hook that fails to block exits 0 and looks healthy.
    const result = spawnSync("bash", [adapter, "git-safety"], {
      input: JSON.stringify(probe.payload(root)),
      encoding: "utf8",
      env: { ...process.env, CLAUDE_PROJECT_DIR: root },
    });
    const blocked = probe.blocked(result.status, result.stdout ?? "");
    checks.push({
      name: `${tool} blocking`,
      ok: blocked,
      detail: blocked ? "probe blocked as expected" : "probe was NOT blocked — this hook is not protecting you",
    });
  }

  if (options.json) {
    process.stdout.write(`${JSON.stringify({ root, checks }, null, 2)}\n`);
  } else {
    process.stdout.write(`agent-init doctor -> ${root}\n\n`);
    for (const check of checks) {
      process.stdout.write(`  ${check.ok ? "ok  " : "FAIL"}  ${check.name.padEnd(24)}${check.detail}\n`);
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
