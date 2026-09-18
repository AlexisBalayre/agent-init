# Normalised hook contract

Policies are written once and know nothing about which agent invoked them. Adapters translate a
host tool's native input into this contract and translate the result back.

## Events

Exactly three. A host event with no counterpart here is not ported.

| Event | Fires | Populated |
| :-- | :-- | :-- |
| `pre-tool:bash` | before a shell command runs | `AGENT_COMMAND` |
| `post-edit` | after a file write or edit | `AGENT_FILES` |
| `turn-end` | after the agent finishes responding | — |

## Environment

| Variable | Meaning |
| :-- | :-- |
| `AGENT_EVENT` | one of the three above |
| `AGENT_TOOL` | host id: `claude-code`, `opencode`, `codex`, `mistral-vibe`, `cursor` |
| `AGENT_COMMAND` | the shell command about to run (`pre-tool:bash` only) |
| `AGENT_FILES` | newline-separated paths (`post-edit` only) |
| `AGENT_PROJECT_DIR` | repository root |
| `AGENT_CWD` | the session's working directory, which in a git worktree is not the repository root; falls back to `AGENT_PROJECT_DIR` |

## Exit codes

| Code | Meaning |
| :-- | :-- |
| `0` | allow |
| `2` | **block** — the reason is written to stderr and shown to the agent |
| other | policy error; the adapter allows and warns, never blocks on its own bug |

Blocking is the least portable part of the design, so each adapter expresses exit 2 in its host's
own convention: Claude Code passes it through, an opencode plugin throws.

## Requirements

`bash` >= 3.2 and `jq`. Shell JSON extraction is deliberately not hand-rolled: the parsed field is
the command under guard, so a parse bug an embedded quote can defeat is a bypass of the only hook
whose job is blocking.

## Known limitation: literal matching

`git-safety` matches patterns against the raw command text. A command that merely *contains* a
dangerous pattern as data — a heredoc writing documentation, a `grep` for the pattern itself — is
blocked as a false positive. This is deliberate: the alternative is parsing shell, and a parser
that disagrees with the user's actual shell is a bypass rather than an inconvenience. Users who hit
it should write the file with an editor tool rather than a shell heredoc.
