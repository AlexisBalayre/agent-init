# Contract fixtures

The real payload each tool sends for each normalised event, captured by hand once and committed as
`<tool>/<event>.json`. Adapters are unit-tested against these — including that the blocking path
returns that tool's own refusal shape.

Events: `pre-tool:bash`, `post-edit`, `turn-end`.

These go stale silently when a tool changes its payload. That is a known, accepted risk; see
decision 6. `agent-init doctor` is the live check.
