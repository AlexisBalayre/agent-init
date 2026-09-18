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

status=0
while IFS='|' read -r sha kind name email; do
  [ -n "$email" ] || continue
  lower=$(printf '%s' "$email" | tr '[:upper:]' '[:lower:]')
  if ! is_allowed "$lower"; then
    printf 'Unapproved %s identity on %s: %s <%s>\n' "$kind" "$sha" "$name" "$email" >&2
    status=1
  fi
done < <(git log --format='%h|author|%an|%ae%n%h|committer|%cn|%ce' "$RANGE")

if [ "$status" -ne 0 ]; then
  printf '\nEvery commit must be authored and committed by an address in %s.\n' "$ALLOWLIST" >&2
  printf 'Fix the identity (git config user.email) and amend or rebase before merging.\n' >&2
  exit 1
fi

printf 'Commit identities clean over %s: every author and committer is on the allowlist.\n' "$RANGE"
