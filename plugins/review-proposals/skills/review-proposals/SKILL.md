---
name: review-proposals
description: Step back and assess all open proposals in a project's `docs/proposals/` together — conflicts, overlaps, ordering, oversized proposals, drift from the project vision, and clashes with accepted decisions in `docs/decisions/`. Invoke explicitly, e.g. "review the proposals", "big-picture check on the proposals", "what's the state of the backlog?".
model: fable
effort: xhigh
context: fork
---

# Review Proposals

Look at every open proposal at once and say what you can only see from that height.
Reviewing one proposal at a time misses the collisions between them; that is the whole point of this skill.

A proposal is meant to be one coherent collection of related features that can be delivered in a single PR / session.
A decision is an accepted, recorded choice about how the project works.

## Step 0: Gather

- Read every file in `docs/proposals/` and `docs/decisions/`. If `docs/proposals/` is missing or empty, say so and stop.
- Skip proposals marked done, rejected, or superseded; review only open ones. If status is not recorded, treat it as open and say you assumed so.
- Find the project's stated goal or vision — the README first, then any vision/goals doc under `docs/`. If none exists, say "no vision stated" and skip the vision check; never invent one to judge against.
- Skim the code only where a claim needs checking (e.g. a proposal describes something as missing that may already exist).

## Step 1: Check

For each check, cite proposals and decisions by filename in every claim.
A finding without a citation does not go in the report.

1. **Conflicts** — proposals that cannot both land as written (A assumes X, B removes X; both change the same behaviour in incompatible ways).
2. **Overlaps** — proposals that duplicate each other or would be simpler merged.
3. **Order** — which proposals depend on or unblock others, and the sensible sequence.
4. **Too large** — proposals that won't fit in one PR / session. The test: does it have more than one independent reason to ship? If so, do the split, don't just suggest one: name each piece with a one-line scope, and say which piece ships first. If the proposal doesn't say enough to draw the boundaries, say what's missing rather than guessing.
5. **Vision drift** — proposals that pull against the stated goal of the project.
6. **Decision clashes** — proposals that contradict an accepted decision. Split these in two:
   - **Deliberate** — the proposal names the decision and argues for changing it. This is valuable, not a defect: it means a new decision record superseding the old one should land with (or before) the proposal.
   - **Unacknowledged** — the proposal contradicts a decision without mentioning it. Flag it as a conflict.
7. **Stale premise** — proposals whose motivation no longer holds because the code, another proposal, or a decision has moved on.

## Step 2: Report

Lead with a three-to-five line summary: the single most important thing to act on, then the next few.

Then one section per check that found something, as short bullets with citations.
Omit checks that found nothing, but list them in one line at the end ("No findings: overlaps, vision drift") so silence is distinguishable from not looking.

Finish with a recommended order of work across all open proposals, noting any to split, merge, or drop.

Keep it tight. Don't restate proposal contents; the reader wrote them.
