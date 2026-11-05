# Design docs

Feature-level design notes: enough structure to capture *why* something is shaped the way it is, without becoming a chore.

<!-- Optional: keep this paragraph only if the repo has a vision doc. -->
`brief.md` is the vision: the pitch, the core thesis, the rules of the project and the non-goals.
Proposals and decisions work inside it; a change to the brief itself deserves its own decision.

The rest is two stages, split by directory so a doc's status is obvious from where it lives:

- **`proposals/`**: an idea, not yet acted on. Mutable. Edit freely, argue in the doc, change your mind.
- **`decisions/`**: dated, what actually shipped (or was deliberately rejected). Accepted decisions preserve their original reasoning.

<!-- Optional: keep this paragraph only if the repo keeps visual evidence. -->
`studies/` and `screenshots/` hold the evidence a look was judged on, kept as drawn and not edited afterwards.
`studies/` has the design pages drawn before a build, and `screenshots/` has the captures of what was built.

A proposal **graduates** into a decision when we act on it: name it with the day's date and its topic, move it to `decisions/`, set its status to `Accepted`, delete the proposal file.

## What goes here

The reasoning behind a feature, and above all what we deliberately *didn't* do.
Point to the code for *how* something works; the code is what stays up to date.

What does **not** go here: devlogs, handoff or scratch notes.

## Avoiding staleness

- **Accepted decisions preserve historical reasoning; they do not prohibit better choices.**
  A decision's body is not rewritten. When one of its choices changes, a new decision records the replacement, and the old one's header says where to look:
  - the whole decision is replaced: its status becomes `Superseded by <topic>`;
  - a part is replaced: its status stays `Accepted`, and a line `- Superseded in part by: <topic>: <the part>` goes under it, one for each decision that replaced a part, naming the section or choice that was replaced.

  Those header lines are the only edit an Accepted decision takes.
- **A substantive choice changing is what needs a decision.**
  Measurements, file names and descriptions of how something is built record the state at the time; they are not constraints.
  Switching a cache from in-memory to on-disk needs a decision; renaming the function that reads it does not.
  Routine implementation changes that keep the choice need no new decision.
- **Supersede in the PR that changes the choice.**
  The new decision names the old topic and identifies the replaced choice, by a quote, a section or a short description.
  The same PR updates the current guidance the choice affects: `AGENTS.md`, `brief.md`, the READMEs.
  It is reviewed with the code and needs no separate approval.
  It can be short: the replaced choice, the new one and the reason.
- **The replacement governs the part it identifies; the rest of the original still applies.**
- **Review evaluates the replacement on its merits** and checks that the supersession is recorded.
  Conflict with an earlier decision is not, by itself, grounds for rejection.
- The `Reflects` header says what evidence the doc stands on: a branch, commits, a benchmark, or a manual check.

## Conventions

- One file per feature or idea.
  - Decisions: `decisions/YYYY-MM-DD-topic.md`, dated the day the decision is accepted, permanent.
  - Proposals: `proposals/topic.md`, no date (it gains one on graduation).
- Other docs cite a decision by topic alone, as `` decision `topic` ``, so a topic is used once across every date.
  A decision that supersedes another takes a new topic.
- Status: `Draft` | `Accepted` | `Superseded by <topic>` | `Withdrawn`; an Accepted decision may also carry `Superseded in part by: <topic>: <the part>` lines.
- `proposals/README.md` lists what's open, in build order: the only index maintained by hand.
  Each entry is `N. [Title](topic.md): <the question it answers>? <what it stands on or where it sits in the order>.`
  Decisions are not indexed anywhere; `ls docs/decisions/` is the list.

## Template

```markdown
# Title

- Status: Draft | Accepted | Superseded by <topic> | Withdrawn
- Created: YYYY-MM-DD
- Reflects: <branch / commits / benchmark / check this describes>

## Summary
One or two sentences: what this is, then the question it answers.

## Context
The problem and the constraints. Why we're touching this at all.

## Design
The decisions made and the *why* behind each. Link to code for the *how*.

## Alternatives considered
What was rejected and why. The highest-value section for future readers.

## Consequences & open questions
What this enables, what it costs, what might bite us later.
```
