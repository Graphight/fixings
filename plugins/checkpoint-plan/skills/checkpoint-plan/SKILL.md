---
name: checkpoint-plan
description: Turn a piece of work (a Jira card, or what was just discussed) into a staged plan with review-and-commit checkpoints. Invoke explicitly, e.g. "checkpoint-plan for PROJ-1234" or "formulate a checkpoint plan for what we just discussed".
argument-hint: "[Jira ticket or description]"
model: opus
effort: high
---

# Checkpoint Plan

Turn a piece of work into a staged plan where every stage is a natural stopping point.
At each stop the user reviews, discusses, and commits before any further work happens — and you hand them a tight one-line commit message for exactly what that stage changed.

## Step 0: Enter plan mode and establish the scope

Enter the dedicated planning mode first: call the `EnterPlanMode` tool before doing anything else, so all scoping and plan-building happens read-only.

The work to plan is either:
- a Jira card — fetch it via the Atlassian MCP for the real scope, or
- "what we just discussed" — use the current session context.

If it's ambiguous which, ask before going further.

## Step 0.5: Interview the user until nothing is assumed

Before staging anything, run the `interview` skill with the Skill tool on the work being planned.
A plan built on a guessed decision stages the guess, and `/execute-stage` then builds it faithfully on a cheap model that never saw the conversation.

## Step 1: Present the staged plan, then stop

Break the work into stages. Each stage must be:
- **Independently reviewable** — it does one coherent thing.
- **Cherry-pickable** — it could stand as its own commit without breaking the build.
- **Small** — if a stage feels like it hides three decisions, split it.

For each stage, give:
1. A one-line title.
2. What changes and why, in two or three sentences — no more.
3. A ready-to-use one-line commit message that tightly encapsulates the stage; match the repo's existing commit style.

Present the whole staged plan through the `ExitPlanMode` tool, headed by the decisions the interview settled — that is the approval gate, for the decisions and the stages together.
Do not start work until the user approves it there.

## Step 1.5: Get onto the branch, then write the plan down

Once the plan is approved — and only then, because plan mode is read-only and cannot touch git — put the working tree on the branch this work will live on.

If the current branch is already a feature branch, stay on it.
If it is `main` or `master`, create the branch now: `<TICKET>-<short-slug>` where there is a ticket, or just `<short-slug>` where there is not.
Take the slug from the work itself, in the style of the repo's existing branches.

Do this before writing the plan file, not as a stage of the plan.
The plan file is named after the current branch, so a plan written on `main` whose first stage then creates a branch leaves `/execute-stage` looking for a file that does not exist.
A branch-creation stage is a stage that deletes its own plan.
So never make "create a branch" a stage.

The branch name carries the ticket forward: `/ship-plan` reads it back off the branch to fill in the PR description without stopping to ask.
No ticket in the name means there is no ticket, which is a normal state, not a gap to chase.

Then save the plan before doing any work.
The plan has to survive this session: `/execute-stage` runs each stage in a fresh sub-agent that has never seen this conversation, and a plan that lives only in context is invisible to it.

Write it to `~/.claude/plans/<repo>-<branch>.md`, where `<repo>` is the repository directory name and `<branch>` is the current branch with `/` replaced by `-`.
Create the `plans` directory if it does not exist.

The file is a checklist — one unticked box per stage, in order — headed by the decisions the interview settled, so the sub-agents that execute each stage inherit them:

```markdown
# <the work being planned>

## Decisions

- <one settled decision per line, as a plain bullet — never a checkbox>

## Stages

- [ ] 1. <stage title>
  <what changes and why, two or three sentences>
  commit: <the one-line commit message>

- [ ] 2. ...
```

Its run sidecar sits beside it: `~/.claude/plans/<repo>-<branch>.run.jsonl`, the plan file's name with `.md` replaced by `.run.jsonl`.
`/ship-plan` and `/execute-stage` append one JSON line per stage outcome, gate command or halt, and this plugin's `/plan-timeline` pane reads them.
Start it empty when writing a new plan, because a new plan on a reused branch name would otherwise inherit the previous plan's stage lines:

```
SIDECAR=~/.claude/plans/$(basename "$(git rev-parse --show-toplevel)")-$(git rev-parse --abbrev-ref HEAD | tr '/' '-').run.jsonl
: > "$SIDECAR"
```

The checkbox is the progress state.
Nothing else tracks how far the plan has got, so it must be ticked as stages land.

Stop after writing the plan; the user runs `/execute-stage` or `/ship-plan`.

## Notes

- The user commits, not you — your job is the message, not the commit.
- Execution is `/execute-stage` (one stage on a cheap model in a sub-agent) or `/ship-plan` (every stage) — the plan file is what makes that possible.
- Keep the staging honest: if partway through it becomes clear the original breakdown was wrong, say so and re-stage rather than forcing the plan.
