# opencode plugin

Copied to `.opencode/plugins/agentspine.js`, which opencode loads at startup.

opencode is the reason the hook contract has the shape it does: it has **no shell hooks**, so it
brackets the difficulty against Claude Code's rich ones. A contract satisfying both generalises.

**Verified 2026-09-14:** `tool.execute.before` aborts a tool call by throwing, so exit 2 from a
shared policy becomes a thrown `Error` carrying the policy's stderr.

**`turn-end`** maps to the `session.idle` event (verified 2026-09-14). One asymmetry that is not
worked around: by the time the turn is over there is nothing left to block, and opencode offers no
documented way to feed hook output back into the agent's context, so a failing gate is *reported*
on stderr here where Claude Code's `Stop` hook can force the agent to fix it.
