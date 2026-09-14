import path from "node:path";
import { existsSync } from "node:fs";
import type { Stack, Tool } from "./detect.utils.js";

export type Action =
  | { kind: "create"; target: string; content: string }
  | { kind: "splice"; target: string; content: string; toml?: boolean }
  | { kind: "merge-json"; target: string; value: Record<string, unknown> }
  | { kind: "symlink"; target: string; to: string }
  | { kind: "copy-dir"; target: string; from: string }
  | { kind: "copy"; target: string; from: string }
  | { kind: "skip"; target: string; reason: string };

export type PlanOptions = {
  root: string;
  templates: string;
  tools: Tool[];
  stacks: Stack[];
  symlink: boolean;
  hooks: boolean;
  /** Gate commands nobody confirmed are written commented out, never silently active. */
  confirmed: boolean;
};

const AGENTS_BODY = `## Agent setup

Shared instructions for every coding agent in this repository. Tool-specific layers point here
rather than repeating it.

- Conventions, skills and hooks live in \`.agents/\`.
- The quality gate reads \`.agents/quality.toml\`.
- Hook policies are shared shell scripts; each tool has a thin adapter in
  \`.agents/hooks/adapters/\`. The contract is \`.agents/hooks/CONTRACT.md\`.

Managed by agent-init. Edit outside the markers, or edit \`.agents/\` directly.`;

const CLAUDE_BODY = "@AGENTS.md";

const claudeHooks = (hooks: boolean) =>
  hooks
    ? {
        hooks: {
          PreToolUse: [
            {
              matcher: "Bash",
              hooks: [
                {
                  type: "command",
                  command: '"$CLAUDE_PROJECT_DIR"/.agents/hooks/adapters/claude-code.sh git-safety',
                  timeout: 5,
                },
              ],
            },
          ],
          Stop: [
            {
              hooks: [
                {
                  type: "command",
                  command: '"$CLAUDE_PROJECT_DIR"/.agents/hooks/adapters/claude-code.sh quality-gate',
                  timeout: 300,
                },
              ],
            },
          ],
        },
      }
    : {};

export function renderQualityToml(stacks: Stack[], confirmed: boolean): string {
  const header = `# Quality gate — read by .agents/hooks/policies/quality-gate.sh at turn-end.
#
# One [[gate]] block per stack. A missing or empty value skips that step; a file with
# no gates is a silent no-op. Only \`key = "value"\` entries are supported, and escapes
# are not interpreted — put regexes in single-quoted literal strings.
#
#   paths      regex matched against the START of a changed path (omit = whole repo)
#   files      regex the changed file must match
#   lint_fix   run first; receives matched files as arguments
#   lint       must exit 0; receives matched files as arguments; non-zero blocks the turn
#   typecheck  run once, no arguments
`;

  const gates = (stacks.length > 0 ? stacks : [{ files: "" }]).map((stack) => {
    const prefix = confirmed ? "" : "# ";
    const lines = [
      "[[gate]]",
      `paths = ''`,
      `files = '${stack.files}'`,
      ...(["lintFix", "lint", "typecheck"] as const)
        .map((key) => {
          const value = stack[key];
          if (!value) return null;
          const name = key === "lintFix" ? "lint_fix" : key;
          return `${prefix}${name} = "${value}"`;
        })
        .filter((line): line is string => line !== null),
    ];
    return lines.join("\n");
  });

  const note = confirmed
    ? ""
    : `#
# The commands below were inferred from this repository, not confirmed by you, so they
# are commented out. A gate you believe is running but is not is worse than one that is
# obviously unfinished. Uncomment what is correct.
`;

  return `${header}${note}\n${gates.join("\n\n")}\n`;
}

export function buildPlan(options: PlanOptions): Action[] {
  const { root, templates, tools, stacks, symlink, hooks, confirmed } = options;
  const actions: Action[] = [];
  const abs = (p: string) => path.join(root, p);

  actions.push({ kind: "copy-dir", target: ".agents/hooks", from: path.join(templates, "agents/hooks") });
  actions.push({
    kind: "create",
    target: ".agents/skills/README.md",
    content: `# Skills\n\nOne directory per skill, each with a \`SKILL.md\` carrying \`name\` and \`description\`\nfrontmatter (the Anthropic Agent Skills spec).\n\nCodex, opencode and Mistral Vibe read this path natively. Claude Code and Cursor reach it\nthrough a symlink.\n`,
  });

  actions.push(
    existsSync(abs(".agents/quality.toml"))
      ? { kind: "skip", target: ".agents/quality.toml", reason: "already configured" }
      : { kind: "create", target: ".agents/quality.toml", content: renderQualityToml(stacks, confirmed) },
  );

  actions.push(spliceOrCreate(root, "AGENTS.md", AGENTS_BODY));

  if (tools.includes("claude-code")) {
    actions.push(spliceOrCreate(root, "CLAUDE.md", CLAUDE_BODY));
    if (hooks) actions.push({ kind: "merge-json", target: ".claude/settings.json", value: claudeHooks(true) });
    actions.push(
      symlink
        ? { kind: "symlink", target: ".claude/skills", to: "../.agents/skills" }
        : { kind: "copy-dir", target: ".claude/skills", from: abs(".agents/skills") },
    );
  }

  if (tools.includes("opencode")) {
    actions.push({ kind: "skip", target: ".opencode/skills", reason: "opencode reads .agents/skills natively" });
    if (hooks) {
      actions.push({
        kind: "copy",
        target: ".opencode/plugins/agent-init.js",
        from: path.join(templates, "agents/plugins/opencode/agent-init.js"),
      });
    }
  }

  return actions;
}

function spliceOrCreate(_root: string, target: string, body: string): Action {
  // splice handles a missing file too: an empty document becomes just the managed block.
  return { kind: "splice", target, content: body };
}
