import { existsSync, readFileSync } from "node:fs";

/**
 * The model's structured output, however the workflow hands it over. It travels as an environment
 * variable inside one job, and as a file when it crosses a job boundary: the poster runs with the
 * write-capable token and the model's job does not, so the two cannot share a step.
 */
export function structuredOutput(env: NodeJS.ProcessEnv): string {
  const file = env.REVIEW_STRUCTURED_OUTPUT_FILE;
  if (file) {
    // Absent means the run died before the model reported, which reads as "no review", never as
    // a clean one: the callers treat an empty string exactly that way.
    if (!existsSync(file)) return "";
    return readFileSync(file, "utf8");
  }
  return env.REVIEW_STRUCTURED_OUTPUT ?? "";
}
