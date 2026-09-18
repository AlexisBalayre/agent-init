# Security

## Reporting a vulnerability

Please report privately through GitHub's
[security advisories](https://github.com/AlexisBalayre/agent-init/security/advisories/new) rather
than a public issue. I will confirm receipt, and credit you in the advisory unless you prefer
otherwise.

## What is in scope

`agent-init` writes configuration that coding agents execute, so the interesting surface is what
that configuration can be talked into doing:

- **A hook policy that fails to block.** `git-safety` refusing a destructive command is the whole
  point; a bypass is a vulnerability, and so is a policy that exits 0 where it should exit 2. Note
  that a policy matching its patterns against raw command text is deliberate: false positives are
  preferred to bypasses.
- **The emitted CI review pipeline** (`--packs ci-review`), which runs a model over untrusted pull
  request content. The model's job holds read-only permissions and a separate job posts, so report
  anything that would hand the model's step a write-capable token, let a pull request supply the
  config or skills the review runs with (the workflow restores those from the base branch), or leak
  a secret into what the model reads.
- **Scaffolding that escapes its target**, such as a path in a plan that writes outside the
  repository, or a merge that clobbers a user's existing configuration.

## What is not

- A model producing a wrong or unhelpful review. That is a quality issue; open a normal issue.
- Prompt injection that only changes what the model *says*, with no write path and no secret
  exposure. Worth reporting as an issue, but not an advisory.
- The tools themselves (Claude Code, Codex, opencode, Mistral Vibe, Cursor). Report those upstream;
  if the wiring `agent-init` emits makes such a bug reachable when it otherwise would not be, that
  part is in scope here.

## Supported versions

The latest published minor version. This project is pre-1.0; fixes land forward rather than as
backports.
