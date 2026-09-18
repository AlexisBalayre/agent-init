#!/usr/bin/env bash
# Mistral Vibe adapter. Vibe is the one host that does not block on exit 2: a hook
# denies by exiting 0 and printing {"decision": "deny", "reason": ...} on stdout, so
# this adapter translates. stdout is reserved for that JSON; everything else goes to
# stderr, or Vibe reports a malformed response.
# Usage: mistral-vibe.sh <policy-name>
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
  pre_tool)
    # Vibe's shell tool name is not part of any documented contract, so the payload
    # decides: a tool_input carrying a command is the shell tool, whatever it is called.
    AGENT_COMMAND=$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty')
    [ -n "$AGENT_COMMAND" ] || exit 0
    AGENT_EVENT="pre-tool:bash"
    ;;
  post_tool)
    AGENT_FILES=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // .tool_input.path // empty')
    [ -n "$AGENT_FILES" ] || exit 0
    AGENT_EVENT="post-edit"
    ;;
  post_agent)
    AGENT_EVENT="turn-end"
    ;;
  *) exit 0 ;;
esac

AGENT_PROJECT_DIR=$(printf '%s' "$INPUT" | jq -r '.cwd // empty')
[ -n "$AGENT_PROJECT_DIR" ] || AGENT_PROJECT_DIR=$(pwd)
AGENT_CWD="$AGENT_PROJECT_DIR"

export AGENT_EVENT AGENT_TOOL="mistral-vibe" AGENT_PROJECT_DIR AGENT_CWD
export AGENT_COMMAND="${AGENT_COMMAND:-}" AGENT_FILES="${AGENT_FILES:-}"

POLICY_STDERR=$("$POLICY" 2>&1 1>/dev/null)
POLICY_STATUS=$?

if [ "$POLICY_STATUS" -eq 2 ]; then
  jq -n --arg reason "$POLICY_STDERR" '{decision: "deny", reason: $reason}'
  exit 0
fi

[ -n "$POLICY_STDERR" ] && printf '%s\n' "$POLICY_STDERR" >&2
if [ "$POLICY_STATUS" -ne 0 ]; then
  printf 'agent-init: policy %s exited %s; allowing.\n' "$POLICY_NAME" "$POLICY_STATUS" >&2
fi
exit 0
