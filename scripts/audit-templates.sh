#!/usr/bin/env bash
# Fails if shipped content carries a specific project's or person's fingerprints.
# Shipped content goes into strangers' repositories, so a leak here is permanent and
# public. This runs in CI so the check cannot be forgotten when a skill is ported.
set -uo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.." || exit 1

# quality.toml deliberately shows a real toolchain as a commented-out example.
EXCLUDE="templates/agents/quality.toml"

# Vendor and workflow identifiers that betray a specific employer or person.
FINGERPRINTS='acolad|sonarqube|sonar_|wiz_|linear\.app|atlassian|TRACKER_[A-Z_]+|OBSIDIAN_|\.internal\b'
# Names and paths that only exist in the repository this content was extracted from.
COUPLING='acme|docs/conventions/|pnpm-lock|_journal\.json|PROJ-[0-9]'
# agentspine's own docs never land in a scaffolded repo, so shipped content citing them sends the
# reader to a file they do not have.
OWN_DOCS='docs/capability-matrix|docs/design/'

status=0
scan() {
  local label="$1" pattern="$2"
  local hits
  hits=$(grep -rniE "$pattern" templates/ 2>/dev/null | grep -v "^$EXCLUDE:")
  if [ -n "$hits" ]; then
    printf '%s:\n%s\n\n' "$label" "$hits" >&2
    status=1
  fi
}

scan "Employer or personal fingerprints in shipped content" "$FINGERPRINTS"
scan "References to the originating repository" "$COUPLING"
scan "References to agentspine's own docs, which a scaffolded repo does not have" "$OWN_DOCS"

if [ "$status" -eq 0 ]; then
  printf 'templates/ clean: no employer, personal, or originating-repo references.\n'
fi
exit "$status"
