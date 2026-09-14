---
name: domain-modeling
description: Maintain this repo's documented language as design decisions land. Use when pinning down domain terminology, recording an architectural decision, or when another skill needs the docs kept current during a session.
---

# Domain Modeling

Actively sharpen the project's documented language as you design: challenge terms, stress-test them with edge-case scenarios, and update the docs the moment a decision crystallises. Merely *reading* the docs for vocabulary is not this skill; reach for it when the language is being *changed*, not just consumed.

## Where the documented language lives

Find this project's equivalents before you start; `AGENTS.md` should say where they are. Most repos
have some subset:

| Source | What it covers |
| :-- | :-- |
| A glossary | Cross-cutting nouns and the one canonical name for each |
| Naming or code conventions | Role taxonomy, naming stems, module/class suffixes |
| Narrative docs per subsystem | The current story of how one area works |
| An ADR log | Dated record of why a hard-to-reverse choice was made |

If the project has none of these, that is itself the first finding: propose the smallest one that
would have prevented the ambiguity you just hit, rather than inventing a full documentation set.

Before a session, skim whichever of them exist for the area in question.

## During the session

### Challenge against the existing language

When the user uses a term that conflicts with the project's documented language, call it out.
Example: "The glossary defines `Session` as the live client connection context; you're using it for
the process that runs it. Which do you mean?"

### Sharpen fuzzy language

Propose precise canonical terms; pull from the existing glossary first, only invent when nothing
fits. The ambiguities worth hunting are the ones where one word covers two lifetimes or two owners:

- A word used for both a user-facing context and the process implementing it
- A word used for both an inbound event and its rendered output
- Two words from different vendors or libraries for the same concept (pick one, record the loser)
- A word that means something different on each side of a service boundary

### Stress-test with concrete scenarios

Force precision with edge cases that touch a boundary. The shapes that expose fuzzy language:

- Something is in flight when its owner disappears — what state is it in?
- Two components disagree about the same entity's state — which one is authoritative?
- A fan-out partially fails — is the whole thing succeeded, partial, or failed, and who decides?

### Cross-reference with code

When the user states how something works, verify it against the code in the area they are
describing. Surface contradictions with the file that disagrees: "`session-manager` tears down when
the last participant leaves, but you said sessions stay warm. Which is right?"

### Update the existing docs inline

When something resolves, update it in place. Capture as it happens; don't batch.

- **New cross-cutting noun?** Add it to the project's glossary.
- **Naming stem or role suffix decision?** Update the naming conventions.
- **Subsystem narrative has drifted from reality?** Update that subsystem's doc.
- **Hard-to-reverse choice with non-obvious rejected alternatives?** Open an ADR.

Do not create a parallel `CONTEXT.md`. See [CONTEXT-FORMAT.md](./CONTEXT-FORMAT.md) for the underlying glossary discipline if you need a reminder of what a good entry looks like.

### Offer ADRs sparingly

Only offer an ADR when all three are true:

1. **Hard to reverse**: the cost of changing your mind later is meaningful
2. **Surprising without context**: a future reader will wonder "why did they do it this way?"
3. **The result of a real trade-off**: there were genuine alternatives and one was picked for specific reasons

If any of the three is missing, skip it. See [ADR-FORMAT.md](./ADR-FORMAT.md) and [docs/adr/README.md](../../../docs/adr/README.md) for the bar and template.
