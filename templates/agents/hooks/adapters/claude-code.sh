#!/usr/bin/env bash
# Claude Code adapter. Its hook interface is the shared claude-shaped one.
exec "$(dirname "${BASH_SOURCE[0]}")/claude-shaped.sh" claude-code "${1:-}"
