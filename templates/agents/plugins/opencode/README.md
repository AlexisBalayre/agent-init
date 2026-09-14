# opencode plugin

Copied to `.opencode/plugins/agent-init.js`, which opencode loads at startup.

opencode is the reason the hook contract has the shape it does: it has **no shell hooks**, so it
brackets the difficulty against Claude Code's rich ones. A contract satisfying both generalises.

**Verified 2026-09-14:** `tool.execute.before` aborts a tool call by throwing, so exit 2 from a
shared policy becomes a thrown `Error` carrying the policy's stderr.

**Not wired:** `turn-end`. opencode's session-level event names are unverified, and inventing one
would silently do nothing — the failure mode this project exists to avoid. The quality gate is
Claude Code-only until that is confirmed.
