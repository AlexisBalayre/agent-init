# templates/

Everything here is copied or symlinked into a user's repository. Two hard rules:

- **Node-free.** Markdown and POSIX shell only.
- **Repo-agnostic.** No references to a specific project's convention paths, tracker, or stack.
  A skill that needs project conventions asks for them; it does not assume a layout.

Layout mirrors what is emitted:

```
agents/skills/<name>/SKILL.md    Anthropic Agent Skills spec: name + description frontmatter
agents/agents/<name>.md          intersection-only frontmatter (name, description, body)
agents/hooks/policies/*.sh       tool-agnostic; read the normalised AGENT_* contract
agents/hooks/adapters/*.sh       per-tool input parsing and exit-code mapping
```
