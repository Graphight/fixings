---
name: write-proposal
description: Write a proposal into a project's `docs/proposals/`, after reading the code and interviewing the user on the behaviour they expect, so the proposal records their decisions rather than guesses. Invoke explicitly, e.g. "write a proposal for X", "propose X", "turn this idea into a proposal".
argument-hint: "[idea]"
model: opus
effort: high
---

# Write Proposal

Turn an idea into a proposal the user would have written themselves.
A proposal written straight from a one-line idea fills every gap with a plausible guess, and the guess then reads as the spec.

A proposal is one coherent piece of work that fits in a single PR / session and answers one question; "no" is a valid answer.

## Step 0: Find the template

Read the repo's `docs/README.md`; its conventions and template are the shape the proposal takes.

If there is no `docs/README.md`, stop and say so, and ask whether to scaffold `docs/`.
On a yes, write `docs/README.md` from `${CLAUDE_SKILL_DIR}/reference/docs-readme.md`, dropping each paragraph marked optional unless the repo has what it describes and removing the `<!-- Optional: ... -->` markers from the ones kept, and create `docs/proposals/README.md` and `docs/decisions/`.

## Step 1: Read

Facts first, so the interview only asks for decisions:

- Read the code the idea touches, and note the commit you read it at for the `Reflects` header.
- Read `docs/proposals/README.md` and every open proposal, so you know what this would sit beside or collide with.
- Read the decisions in `docs/decisions/` the idea touches, and the vision doc if the repo has one.

If the idea is already built, or an open proposal already covers it, say so and stop.

## Step 2: Interview

Run the `interview` skill with the Skill tool on the idea.
If `interview` is not installed, interview the user yourself in `AskUserQuestion` rounds until every decision behind the idea is settled.
Besides the decisions the idea itself raises, its design tree carries two that only a proposal has:

- **Too large?** If the idea has more than one independent reason to ship, ask a question offering the split, naming each piece with a one-line scope. Each piece the user accepts becomes its own proposal, with its own decisions, build-order slot, file and index line.
- **Build order.** Ask where each proposal goes in `docs/proposals/README.md`, offering slots from the existing list: after what it stands on, before what it unblocks. Pieces of one split are offered slots relative to each other too.

After a split, the rest of the interview settles each piece's decisions in turn, and its closing list groups the decisions by piece.

## Step 3: Write

Write `docs/proposals/<topic>.md` in the repo's template, once for each proposal the interview settled:

- `Status: Draft`, `Created:` today, `Reflects:` the files you read and the commit you read them at.
- **Summary** poses the one question the proposal answers, and names any accepted decision or `AGENTS.md` rule the proposal would break or supersede, so a reader sees the conflict before the Design.
- **Design** holds the interview's settled decisions, one bullet per decision with the why the user gave, including each option the scope question ticked.
- **Alternatives considered** holds the options the user turned down, and why.
- **Consequences & open questions** holds what is left open.

Add each one's entry to `docs/proposals/README.md` at the slot the user chose, in the shape the list already uses.

Do not touch git; the user commits.
End with the path of each proposal and the index line you added for it.
