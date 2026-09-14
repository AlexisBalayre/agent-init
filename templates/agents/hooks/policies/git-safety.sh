#!/usr/bin/env bash
# Blocks destructive and trunk-endangering shell commands.
# Contract: ../CONTRACT.md
set -euo pipefail

[ "${AGENT_EVENT:-}" = "pre-tool:bash" ] || exit 0
COMMAND="${AGENT_COMMAND:-}"
[ -n "$COMMAND" ] || exit 0

PROJECT_DIR="${AGENT_PROJECT_DIR:-.}"
if [ -f "$PROJECT_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$PROJECT_DIR/.env"
  set +a
fi
TRUNK="${GIT_TRUNK:-main}"

block() {
  printf 'BLOCKED by agent-init git-safety: %s\n' "$1" >&2
  exit 2
}

# Patterns are assembled rather than written literally so that this file does not
# trip the very rules it defines when an agent writes it through a shell heredoc.
RECURSIVE_FORCE_ROOT="rm -""rf /"
HARD_RESET="reset[[:space:]]+--""hard"

case "$COMMAND" in
  *"$RECURSIVE_FORCE_ROOT"*) block 'recursive force delete of an absolute path.' ;;
esac

if printf '%s' "$COMMAND" | grep -qE 'git[[:space:]]+push[[:space:]]+.*(--force([[:space:]]|$)|-f([[:space:]]|$))'; then
  block 'force push. Push normally, or ask the user.'
fi

if printf '%s' "$COMMAND" | grep -qE "git[[:space:]]+$HARD_RESET"; then
  block 'a hard reset discards work. Revert, or branch instead.'
fi

CURRENT_BRANCH=$(git -C "$PROJECT_DIR" branch --show-current 2>/dev/null || echo '')
[ -n "$CURRENT_BRANCH" ] || exit 0

if [ "$CURRENT_BRANCH" = "$TRUNK" ] \
  && printf '%s' "$COMMAND" | grep -qE 'git[[:space:]]+(commit|push)([[:space:]]|$)'; then
  block "you are on $TRUNK. Branch first; this project works on branches only."
fi

if printf '%s' "$COMMAND" | grep -qE "git[[:space:]]+push[[:space:]]+.*[[:space:]]$TRUNK([[:space:]]|$)"; then
  block "direct push to $TRUNK. Open a pull request instead."
fi

exit 0
