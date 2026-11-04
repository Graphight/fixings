---
name: interview
description: Interview the user in AskUserQuestion rounds until every decision behind a piece of work is settled and nothing is assumed. Run by checkpoint-plan and write-proposal before they write anything down; also invoke explicitly, e.g. "interview me on this", "ask me what I actually want before you start".
---

# Interview

Interview the user until you both share one understanding of the work.
Whatever gets written after this, a plan or a proposal, writes down the answers; a decision you guessed gets written down as if the user had made it.

## Map the decisions

Map the work as a design tree: every decision branches into the decisions that hang off it.
The frontier is every decision whose prerequisites are already settled — the questions you can ask now without guessing at answers you haven't heard yet.

Facts are your job, decisions are the user's.
Never ask the user something the codebase, git, Jira or a tool could tell you — dispatch the `Explore` agent with `effort: "lower"` to look it up, and ask only the questions downstream of it once it reports.

## Ask about behaviour, not implementation

Frame each question as what the user will see happen, not how it gets built.
"You edit the file mid-run: does the pane go stale, refresh, or warn?" beats "cache or re-read?".
Behaviour is where the user's intent and your guess split apart; the implementation follows from the behaviour, and mostly is not theirs to choose.
Ask an implementation question only when the choice changes something the user can see, costs, or maintains.

Always ask one scope question: name the adjacent things the work could plausibly grow into and ask "Include any of these?" with `multiSelect: true`.
Each ticked option goes into the settled decisions as part of the work; an unticked one is not built and not written down.

## Work it in rounds

Ask the whole frontier in one round through the `AskUserQuestion` tool, never as a markdown list of questions in chat:

- One question per decision, with a short `header` chip naming it.
- Two to four concrete options, each with a one-line `description` of what choosing it means.
- Put your recommended option first and end its label with `(Recommended)`.
- Set `multiSelect: true` when the choices are not mutually exclusive.
- Add a `preview` when the options are code, config or layouts the user needs to compare side by side.
- Don't add an "Other" option; the tool supplies free-text input itself.

The tool takes at most four questions per call, so a frontier wider than four goes out as consecutive calls in the same round.
A question whose answer depends on another question still open in this round belongs to a later round.
After each round, recompute the frontier from the answers and ask the next one.

## Say how many rounds to expect

The depth of the design tree is the round count, so count it before asking anything.
Before round one, say in one line how many rounds to expect and what each covers, e.g. "About 3 rounds: scope, then behaviour, then where it lands."
Tag every `AskUserQuestion` call with the round, as `metadata: { source: "interview:<n>/<N>:<topic>" }`, e.g. `interview:2/3:behaviour`, which this plugin's round row draws above the dialog.
Every call in a round carries the same tag.
The count is an estimate, because an answer can open a branch nobody saw; when one does, say so in one line and put the new count in the next round's tag, e.g. `interview:3/4:scope`.

## Finish

The interview is done when the frontier is empty: every branch visited, nothing silently assumed.
If the scope is already crisp — a card with clear acceptance criteria, or a discussion that already settled the forks — the first frontier may be empty apart from the scope question; say so in one line rather than inventing questions.

Do not ask the user to confirm the decisions.
The skill that ran the interview writes them straight into its plan or proposal, and the user reviews them there.
Run on its own, end by listing the settled decisions, one per line, each with its why where the user gave one.
