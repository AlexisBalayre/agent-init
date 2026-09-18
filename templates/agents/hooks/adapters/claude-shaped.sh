#!/usr/bin/env bash
# Shared implementation for hosts whose hook interface matches Claude Code's:
# the payload arrives as JSON on stdin with hook_event_name / tool_name / tool_input,
# and exit 2 blocks with the reason on stderr. Claude Code and Codex both use it.
# Usage: claude-shaped.sh <tool-id> <policy-name>
# Contract: ../CONTRACT.md
set -uo pipefail

TOOL_ID="${1:-}"
POLICY_NAME="${2:-}"
HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
POLICY="$HOOK_DIR/policies/$POLICY_NAME.sh"

if [ ! -x "$POLICY" ]; then
  printf 'agent-init: unknown policy %s\n' "$POLICY_NAME" >&2
  exit 0
fi

if ! command -v jq >/dev/null 2>&1; then
  printf 'agent-init: jq is not installed, so hook policies cannot run. Install jq (brew install jq / apt-get install jq) or re-run agent-init with --skip-hooks.\n' >&2
  exit 0
fi

INPUT=$(cat)
HOOK_EVENT=$(printf '%s' "$INPUT" | jq -r '.hook_event_name // empty')
TOOL_NAME=$(printf '%s' "$INPUT" | jq -r '.tool_name // empty')

case "$HOOK_EVENT" in
  PreToolUse)
    [ "$TOOL_NAME" = "Bash" ] || [ "$TOOL_NAME" = "shell" ] || exit 0
    AGENT_EVENT="pre-tool:bash"
    AGENT_COMMAND=$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty')
    ;;
  PostToolUse)
    case "$TOOL_NAME" in
      Edit | Write | MultiEdit | apply_patch) ;;
      *) exit 0 ;;
    esac
    AGENT_EVENT="post-edit"
    AGENT_FILES=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // empty')
    ;;
  Stop)
    AGENT_EVENT="turn-end"
    ;;
  *) exit 0 ;;
esac

AGENT_PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(printf '%s' "$INPUT" | jq -r '.cwd // empty')}"
[ -n "$AGENT_PROJECT_DIR" ] || AGENT_PROJECT_DIR=$(pwd)
AGENT_CWD=$(printf '%s' "$INPUT" | jq -r '.cwd // empty')
[ -n "$AGENT_CWD" ] || AGENT_CWD="$AGENT_PROJECT_DIR"

export AGENT_EVENT AGENT_TOOL="$TOOL_ID" AGENT_PROJECT_DIR AGENT_CWD
export AGENT_COMMAND="${AGENT_COMMAND:-}" AGENT_FILES="${AGENT_FILES:-}"

"$POLICY"
POLICY_STATUS=$?

# Only 0 and 2 are meaningful. A policy that crashed must not block the session.
if [ "$POLICY_STATUS" -ne 0 ] && [ "$POLICY_STATUS" -ne 2 ]; then
  printf 'agent-init: policy %s exited %s; allowing.\n' "$POLICY_NAME" "$POLICY_STATUS" >&2
  exit 0
fi
exit "$POLICY_STATUS"
