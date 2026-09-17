# review-metrics

One `records/<run_id>.json` per automated review run, appended by the `persist-metrics` job of
`.github/workflows/claude-code-review.yml`. The `review-retro` skill mines this history for
recurring failures in the review setup itself.

An orphan branch: it has no parent in the code history and is never merged. Deleting it makes the
workflow's append step fail loudly rather than silently recreating it without its history.