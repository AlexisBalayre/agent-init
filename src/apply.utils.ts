import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Action } from "./plan.utils.js";
import { deepMerge, hasManagedBlock, spliceManagedBlock, tomlComment } from "./managed-block.utils.js";

export type Applied = { target: string; outcome: string };

export function describe(action: Action): string {
  switch (action.kind) {
    case "create": return `create    ${action.target}`;
    case "splice": return `managed   ${action.target}`;
    case "merge-json": return `merge     ${action.target}`;
    case "symlink": return `symlink   ${action.target} -> ${action.to}`;
    case "copy-dir": return `copy      ${action.target}/`;
    case "copy": return `copy      ${action.target}`;
    case "skip": return `skip      ${action.target} (${action.reason})`;
  }
}

export function apply(actions: Action[], root: string): Applied[] {
  return actions.map((action) => ({ target: action.target, outcome: applyOne(action, root) }));
}

function applyOne(action: Action, root: string): string {
  const target = path.join(root, action.target);

  switch (action.kind) {
    case "skip":
      return "skipped";

    case "create": {
      if (existsSync(target)) return "kept";
      write(target, action.content);
      return "created";
    }

    case "splice": {
      const comment = action.toml ? tomlComment : undefined;
      const existing = existsSync(target) ? readFileSync(target, "utf8") : "";
      const updated = spliceManagedBlock(existing, action.content, comment);
      if (updated === existing) return "unchanged";
      write(target, updated);
      return hasManagedBlock(existing, comment) ? "block updated" : existing ? "block added" : "created";
    }

    case "merge-json": {
      const existing = existsSync(target)
        ? (JSON.parse(readFileSync(target, "utf8")) as Record<string, unknown>)
        : {};
      const merged = deepMerge(existing, action.value);
      const serialised = `${JSON.stringify(merged, null, 2)}\n`;
      if (existsSync(target) && readFileSync(target, "utf8") === serialised) return "unchanged";
      write(target, serialised);
      return existsSync(target) ? "merged" : "created";
    }

    case "symlink": {
      mkdirSync(path.dirname(target), { recursive: true });
      if (existsSync(target) || isLink(target)) {
        if (isLink(target)) unlinkSync(target);
        else return "kept (not a symlink)";
      }
      symlinkSync(action.to, target);
      return "linked";
    }

    case "copy-dir": {
      mkdirSync(path.dirname(target), { recursive: true });
      cpSync(action.from, target, { recursive: true });
      return "copied";
    }

    case "copy": {
      mkdirSync(path.dirname(target), { recursive: true });
      cpSync(action.from, target);
      return "copied";
    }
  }
}

function write(target: string, content: string) {
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, content);
}

function isLink(target: string): boolean {
  try {
    return lstatSync(target).isSymbolicLink();
  } catch {
    return false;
  }
}
