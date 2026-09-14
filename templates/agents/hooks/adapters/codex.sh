#!/usr/bin/env bash
# Codex adapter. Verified 2026-09-14: Codex hooks use the same event names
# (PreToolUse, Stop), the same stdin fields, and the same "exit 2 blocks with the
# reason on stderr" convention as Claude Code, so the shared implementation applies.
exec "$(dirname "${BASH_SOURCE[0]}")/claude-shaped.sh" codex "${1:-}"
