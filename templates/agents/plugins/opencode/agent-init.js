// opencode adapter. opencode has no shell hooks, only JS plugins, so this shim maps the
// plugin API onto the same normalised contract the shell policies expect and expresses a
// block the only way opencode offers: by throwing.
// Contract: ../../hooks/CONTRACT.md
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const EDIT_TOOLS = new Set(["edit", "write", "patch"]);

function runPolicy(policyName, env, projectDir) {
  const policy = path.join(projectDir, ".agents", "hooks", "policies", `${policyName}.sh`);
  if (!existsSync(policy)) return { blocked: false };

  const result = spawnSync("bash", [policy], {
    env: { ...process.env, ...env, AGENT_TOOL: "opencode", AGENT_PROJECT_DIR: projectDir },
    encoding: "utf8",
  });

  // Only exit 2 blocks. A policy that crashed must not take the session down with it.
  if (result.status === 2) return { blocked: true, reason: (result.stderr || "").trim() };
  if (result.status !== 0) {
    console.error(`agent-init: policy ${policyName} exited ${result.status}; allowing.`);
  }
  return { blocked: false };
}

export const AgentInit = async ({ directory, worktree }) => {
  const projectDir = worktree ?? directory ?? process.cwd();

  return {
    "tool.execute.before": async (input, output) => {
      if (input.tool !== "bash") return;
      const command = output?.args?.command;
      if (!command) return;

      const { blocked, reason } = runPolicy(
        "git-safety",
        { AGENT_EVENT: "pre-tool:bash", AGENT_COMMAND: command },
        projectDir,
      );

      if (blocked) throw new Error(reason || "Blocked by agent-init git-safety.");
    },

    "tool.execute.after": async (input, output) => {
      if (!EDIT_TOOLS.has(input.tool)) return;
      const file = output?.args?.filePath ?? output?.args?.path;
      if (!file) return;

      runPolicy("post-edit", { AGENT_EVENT: "post-edit", AGENT_FILES: file }, projectDir);
    },
  };
};
