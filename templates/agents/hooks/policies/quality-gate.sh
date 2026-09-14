#!/usr/bin/env bash
# Runs the project's own lint/typecheck over the files this session touched.
# Commands come from .agents/quality.toml; this script knows no language or toolchain.
# Contract: ../CONTRACT.md
set -uo pipefail

[ "${AGENT_EVENT:-}" = "turn-end" ] || exit 0
PROJECT_DIR="${AGENT_PROJECT_DIR:-.}"
CONFIG="$PROJECT_DIR/.agents/quality.toml"
[ -f "$CONFIG" ] || exit 0
cd "$PROJECT_DIR" || exit 0

DIRTY=$(
  {
    git diff --name-only 2>/dev/null
    git diff --cached --name-only 2>/dev/null
    git ls-files --others --exclude-standard 2>/dev/null
  } | sort -u
)
[ -n "$DIRTY" ] || exit 0

# Reads one field of the Nth [[gate]] table. Supported subset: [[gate]] headers and
# `key = "value"` string entries, documented in quality.toml itself. A real TOML parser
# is not available here: the emitted tree may not have Node, and jq does not read TOML.
gate_field() {
  awk -v want="$1" -v idx="$2" '
    /^[[:space:]]*\[\[gate\]\][[:space:]]*$/ { n++; next }
    n == idx {
      line = $0
      sub(/[[:space:]]*#.*$/, "", line)
      if (line !~ /=/) next
      key = line; sub(/=.*$/, "", key); gsub(/[[:space:]]/, "", key)
      if (key != want) next
      sub(/^[^=]*=[[:space:]]*/, "", line)
      # Quotes are stripped, escapes are NOT interpreted. Regexes therefore belong in
      # single-quoted TOML literal strings; a basic string would need doubled backslashes
      # that this reader would pass through verbatim and grep would never match.
      if (line ~ /^'"'"'/) { sub(/^'"'"'/, "", line); sub(/'"'"'[[:space:]]*$/, "", line) }
      else { sub(/^"/, "", line); sub(/"[[:space:]]*$/, "", line) }
      print line
      exit
    }
  ' "$CONFIG"
}

GATE_COUNT=$(grep -c '^[[:space:]]*\[\[gate\]\][[:space:]]*$' "$CONFIG" 2>/dev/null || true)
[ "${GATE_COUNT:-0}" -gt 0 ] 2>/dev/null || exit 0

STATUS=0
i=1
while [ "$i" -le "$GATE_COUNT" ]; do
  PATHS=$(gate_field paths "$i")
  FILES_RE=$(gate_field files "$i")
  LINT_FIX=$(gate_field lint_fix "$i")
  LINT=$(gate_field lint "$i")
  TYPECHECK=$(gate_field typecheck "$i")

  MATCHED="$DIRTY"
  [ -n "$PATHS" ] && MATCHED=$(printf '%s\n' "$MATCHED" | grep -E "^$PATHS" || true)
  [ -n "$FILES_RE" ] && MATCHED=$(printf '%s\n' "$MATCHED" | grep -E "$FILES_RE" || true)
  MATCHED=$(printf '%s\n' "$MATCHED" | while IFS= read -r f; do
    [ -n "$f" ] && [ -f "$f" ] && printf '%s\n' "$f"
  done)

  if [ -n "$MATCHED" ]; then
    if [ -n "$LINT_FIX" ]; then
      printf '%s\n' "$MATCHED" | xargs sh -c "$LINT_FIX \"\$@\"" _ >&2 || true
    fi
    if [ -n "$LINT" ] && ! printf '%s\n' "$MATCHED" | xargs sh -c "$LINT \"\$@\"" _ >&2; then
      printf 'Lint failed on files this session touched.\n' >&2
      STATUS=2
    fi
    if [ -n "$TYPECHECK" ] && ! sh -c "$TYPECHECK" >&2; then
      printf 'Typecheck failed.\n' >&2
      STATUS=2
    fi
  fi
  i=$((i + 1))
done

exit "$STATUS"
