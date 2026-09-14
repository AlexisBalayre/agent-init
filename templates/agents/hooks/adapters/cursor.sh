#!/usr/bin/env bash
# Cursor adapter. Cursor names its events differently but agrees on the important
# part: exit 2 blocks, and is documented as equivalent to returning permission "deny".
# Usage: cursor.sh <policy-name>
# Contract: ../CONTRACT.md
set -uo pipefail

POLICY_NAME="${1:-}"
HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
POLICY="$HOOK_DIR/policies/$POLICY_NAME.sh"

if [ ! -x "$POLICY" ]; then
  printf 'agent-init: unknown policy %s\n' "$POLICY_NAME" >&2
  exit 0
fi
if ! command -v jq >/dev/null 2>&1; then
  printf 'agent-init: jq is not installed, so hook policies cannot run.\n' >&2
  exit 0
fi

INPUT=$(cat)
HOOK_EVENT=$(printf '%s' "$INPUT" | jq -r '.hook_event_name // empty')

case "$HOOK_EVENT" in
  beforeShellExecution)
    AGENT_EVENT="pre-tool:bash"
    AGENT_COMMAND=$(printf '%s' "$INPUT" | jq -r '.command // empty')
    ;;
  afterFileEdit)
    AGENT_EVENT="post-edit"
    AGENT_FILES=$(printf '%s' "$INPUT" | jq -r '.file_path // empty')
    ;;
  stop)
    AGENT_EVENT="turn-end"
    ;;
  *) exit 0 ;;
esac

AGENT_PROJECT_DIR=$(printf '%s' "$INPUT" | jq -r '.workspace_roots[0] // .cwd // empty')
[ -n "$AGENT_PROJECT_DIR" ] || AGENT_PROJECT_DIR=$(pwd)

export AGENT_EVENT AGENT_TOOL="cursor" AGENT_PROJECT_DIR
export AGENT_COMMAND="${AGENT_COMMAND:-}" AGENT_FILES="${AGENT_FILES:-}"

"$POLICY"
POLICY_STATUS=$?

if [ "$POLICY_STATUS" -ne 0 ] && [ "$POLICY_STATUS" -ne 2 ]; then
  printf 'agent-init: policy %s exited %s; allowing.\n' "$POLICY_NAME" "$POLICY_STATUS" >&2
  exit 0
fi
exit "$POLICY_STATUS"
