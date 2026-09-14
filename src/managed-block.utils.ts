export const BLOCK_START = "<!-- agent-init:start -->";
export const BLOCK_END = "<!-- agent-init:end -->";

/**
 * Inserts or replaces our delimited block, leaving everything the user wrote untouched.
 * Used for markdown and for TOML, where the alternative — parse and re-serialise — would
 * silently destroy the user's comments and key ordering.
 */
export function spliceManagedBlock(
  existing: string,
  body: string,
  comment: (text: string) => string = (text) => text,
): string {
  const start = comment(BLOCK_START);
  const end = comment(BLOCK_END);
  const block = `${start}\n${body.trim()}\n${end}`;

  const from = existing.indexOf(start);
  const to = existing.indexOf(end);

  if (from !== -1 && to > from) {
    return existing.slice(0, from) + block + existing.slice(to + end.length);
  }
  if (existing.trim() === "") return `${block}\n`;
  return `${existing.replace(/\s*$/, "")}\n\n${block}\n`;
}

export function hasManagedBlock(existing: string, comment: (t: string) => string = (t) => t) {
  return existing.includes(comment(BLOCK_START));
}

/** TOML has no block comments, so each marker line is commented individually. */
export const tomlComment = (text: string) => `# ${text}`;

type Json = Record<string, unknown>;

/**
 * Merges our keys into the user's config without ever discarding theirs. Arrays are
 * concatenated rather than replaced, because every tool's hook config is an array and
 * replacing it would silently drop hooks the user wired themselves.
 */
export function deepMerge(base: Json, incoming: Json): Json {
  const out: Json = { ...base };

  for (const [key, value] of Object.entries(incoming)) {
    const current = out[key];
    if (Array.isArray(current) && Array.isArray(value)) {
      const seen = new Set(current.map((entry) => JSON.stringify(entry)));
      out[key] = [...current, ...value.filter((entry) => !seen.has(JSON.stringify(entry)))];
    } else if (isPlainObject(current) && isPlainObject(value)) {
      out[key] = deepMerge(current, value);
    } else {
      out[key] = value;
    }
  }

  return out;
}

function isPlainObject(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
