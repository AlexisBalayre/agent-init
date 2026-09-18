#!/usr/bin/env bash
# Fails if any commit in range carries an author or committer identity that is not
# on the allowlist. A wrong identity is not a style problem: it publishes the commit
# under whichever account owns that email, and clearing it afterwards means rewriting
# public history. This runs in CI so no local misconfiguration can land one.
set -uo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.." || exit 1

RANGE="${1:-HEAD}"
ALLOWLIST=".github/allowed-authors.txt"

if [ ! -f "$ALLOWLIST" ]; then
  printf 'audit-authors: %s is missing; cannot verify commit identities.\n' "$ALLOWLIST" >&2
  exit 1
fi

# One address per line, case-insensitive; blank lines and # comments ignored.
allowed=$(grep -vE '^[[:space:]]*(#|$)' "$ALLOWLIST" | tr '[:upper:]' '[:lower:]' | sort -u)
if [ -z "$allowed" ]; then
  printf 'audit-authors: %s lists no addresses.\n' "$ALLOWLIST" >&2
  exit 1
fi

is_allowed() {
  printf '%s\n' "$allowed" | grep -qxF "$1"
}

# Read the log up front so a git failure cannot look like an empty, and therefore clean, history.
if ! log=$(git log --format='%h|author|%ae%n%h|committer|%ce' "$RANGE" 2>&1); then
  printf 'audit-authors: could not read the history for %s: %s\n' "$RANGE" "$log" >&2
  exit 1
fi
if [ -z "$log" ]; then
  printf 'audit-authors: %s selected no commits; refusing to report a clean result.\n' "$RANGE" >&2
  exit 1
fi

status=0
# The address is the last field, and read gives the last variable the rest of the line verbatim,
# so an address containing the | delimiter arrives whole and fails the exact-match allowlist
# rather than being truncated into something that passes. Git forbids only <, > and newlines in an
# identity, so | is legal in both name and address; the name is therefore not parsed at all, and
# is looked up separately when a failure needs reporting. The two fields ahead of the address are
# an abbreviated hash and a literal, neither of which can contain a delimiter.
while IFS='|' read -r sha kind email; do
  [ -n "$sha" ] || continue
  lower=$(printf '%s' "$email" | tr '[:upper:]' '[:lower:]')
  if ! is_allowed "$lower"; then
    if [ "$kind" = author ]; then
      name=$(git log -1 --format='%an' "$sha")
    else
      name=$(git log -1 --format='%cn' "$sha")
    fi
    printf 'Unapproved %s identity on %s: %s <%s>\n' "$kind" "$sha" "$name" "$email" >&2
    status=1
  fi
done <<EOF
$log
EOF

if [ "$status" -ne 0 ]; then
  printf '\nEvery commit must be authored and committed by an address in %s.\n' "$ALLOWLIST" >&2
  printf 'Fix the identity (git config user.email) and amend or rebase before merging.\n' >&2
  exit 1
fi

printf 'Commit identities clean over %s: every author and committer is on the allowlist.\n' "$RANGE"
