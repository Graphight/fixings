# Design docs

Notes that capture *why* something is shaped the way it is, without becoming a chore.

`brief.md` is the vision: the pitch, the thesis and the non-goals.
Proposals and decisions work inside it; a change to the brief itself deserves its own decision.

The rest is two stages, split by directory so a doc's status is obvious from where it lives:

- **`proposals/`**: an idea, not yet acted on. Mutable. Edit freely, argue in the doc, change your mind.
- **`decisions/`**: dated, what was chosen or deliberately rejected. Accepted decisions preserve their original reasoning.

`screenshots/` holds the pictures of what a plugin draws, as `<plugin>.jpg` and an annotated `<plugin>-annotated.jpg`, which its README embeds.

A proposal **graduates** into a decision when we act on it: name it with the day's date and its topic, move it to `decisions/`, set its status to `Accepted`, delete the proposal file.

## What goes here

The reasoning behind a plugin or a choice, and above all what we deliberately *didn't* do.
Point to the code for *how* something works; the code is what stays up to date.

What does **not** go here: devlogs, handoff or scratch notes.

`AGENTS.md` only maps where things are: a path and its job, with no mechanics and no decision citations, since `grep` over `docs/decisions/` finds the decisions that name a file.

## Avoiding staleness

- **Accepted decisions preserve historical reasoning; they do not prohibit better choices.**
  A decision's body is not rewritten. When one of its choices changes, a new decision records the replacement, and the old one's header says where to look:
  - the whole decision is replaced: its status becomes `Superseded by <topic>`;
  - a part is replaced: its status stays `Accepted`, and a line `- Superseded in part by: <topic>: <the part>` goes under it, one for each decision that replaced a part.

  Those header lines are the only edit an Accepted decision takes.
- **A substantive choice changing is what needs a decision.**
  File names and descriptions of how something is built record the state at the time; they are not constraints.
  Routine implementation changes that keep the choice need no new decision.
- **Supersede in the PR that changes the choice.**
  The new decision names the old topic and identifies the replaced choice, and the same PR updates the current guidance it affects: `AGENTS.md`, `brief.md`, the READMEs.
- **The replacement governs the part it identifies; the rest of the original still applies.**
- **Review evaluates the replacement on its merits** and checks that the supersession is recorded.
- The `Reflects` header says what evidence the doc stands on: a branch, commits, or a live session.

## Conventions

- One file per idea or choice.
  - Decisions: `decisions/YYYY-MM-DD-topic.md`, dated the day the decision is accepted, permanent.
  - Proposals: `proposals/topic.md`, no date (it gains one on graduation).
- Other docs cite a decision by topic alone, as `` decision `topic` ``, so a topic is used once across every date.
  A decision that supersedes another takes a new topic.
- Status: `Proposed` | `Accepted` | `Superseded by <topic>` | `Withdrawn`; an Accepted decision may also carry `Superseded in part by: <topic>: <the part>` lines.
- Decisions are not indexed anywhere; `ls docs/decisions/` is the list.

## Template

```markdown
# Title

- Status: Proposed | Accepted | Superseded by <topic> | Withdrawn
- Created: YYYY-MM-DD
- Reflects: <branch / commits / live session this describes>

## Summary
One or two sentences: what this is.

## Context
The problem and the constraints. Why we're touching this at all.

## Design
The decisions made and the *why* behind each. Link to code for the *how*.

## Alternatives considered
What was rejected and why. The highest-value section for future readers.

## Consequences & open questions
What this enables, what it costs, what might bite us later.
```
