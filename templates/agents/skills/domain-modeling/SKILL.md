---
name: domain-modeling
description: Build and sharpen a project's domain model. Use when discussing codebase terminology, writing or editing the project glossary, or recording or editing an ADR.
---

# Domain Modeling

Actively build and sharpen the project's domain model as you design. This is the *active* discipline: challenging terms, inventing edge-case scenarios, and writing the glossary and decisions down the moment they crystallise. (Merely *reading* the glossary for vocabulary is not this skill: that's a one-line habit any skill can do. This skill is for when you're changing the model, not just consuming it.)

## Where the domain model lives

The project map in `AGENTS.md` says where each of these lives. Most repos keep some subset:

| Source | What it covers |
| :-- | :-- |
| A glossary | The domain language: one canonical name per concept, in one table |
| Naming or code conventions | Role taxonomy, naming stems, module/class suffixes |
| An architecture reference | System shape: components, flows, layout |
| Narrative docs per subsystem | The rationale behind how one area works |
| An ADR log | Dated record of why a hard-to-reverse choice was made |

If the project keeps none of these, that is itself the first finding: propose the smallest one that would have prevented the ambiguity you just hit (usually a glossary at `docs/glossary.md`), record its location in the project map, and never create a parallel `CONTEXT.md` beside docs that already exist.

Before a session, skim the glossary and any ADRs already filed for the area.

## During the session

### Challenge against the glossary

When the user uses a term that conflicts with the existing language in the glossary, call it out immediately. "Your glossary defines 'cancellation' as X, but you seem to mean Y. Which is it?"

### Sharpen fuzzy language

When the user uses vague or overloaded terms, propose a precise canonical term. "You're saying 'account': do you mean the Customer or the User? Those are different things."

### Discuss concrete scenarios

When domain relationships are being discussed, stress-test them with specific scenarios. Invent scenarios that probe edge cases and force the user to be precise about the boundaries between concepts.

### Cross-reference with code

When the user states how something works, check whether the code agrees (the architecture reference, if the project keeps one, maps where each component lives). If you find a contradiction, surface it: "Your code cancels entire Orders, but you just said partial cancellation is possible. Which is right?"

### Update the glossary inline

When a term is resolved, update the glossary right there. Don't batch these up: capture them as they happen. Use the format in [CONTEXT-FORMAT.md](./CONTEXT-FORMAT.md).

The glossary should be totally devoid of implementation details. Do not treat it as a spec, a scratch pad, or a repository for implementation decisions. It is a glossary and nothing else. What resolves outside the glossary goes where it already lives:

- **Naming or structure rule?** The project's conventions for that area.
- **Rationale for how a subsystem works?** That subsystem's narrative doc.
- **System shape has drifted from reality?** The architecture reference.

### Offer ADRs sparingly

Only offer to create an ADR when all three are true:

1. **Hard to reverse**: the cost of changing your mind later is meaningful
2. **Surprising without context**: a future reader will wonder "why did they do it this way?"
3. **The result of a real trade-off**: there were genuine alternatives and you picked one for specific reasons

If any of the three is missing, skip the ADR. Use the format in [ADR-FORMAT.md](./ADR-FORMAT.md).
