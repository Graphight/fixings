---
name: execute-stage
description: Execute the next unfinished stage of an approved checkpoint plan, on a cheap model, then stop for review. Invoke explicitly, e.g. "/execute-stage", "run the next stage", "execute the next step of the plan".
agent: plan-executor
context: fork
background: false
---

# Execute Stage

Build exactly one stage of a plan that `checkpoint-plan` already staged and the user already approved.
One stage per invocation — the halt between stages is the point of the plan, not an inconvenience to work around.

## Step 1: Find the plan

The plan lives at `~/.claude/plans/<repo>-<branch>.md`, where `<repo>` is the repository directory name and `<branch>` is the current branch with `/` replaced by `-`.

```!
git rev-parse --show-toplevel || true
git rev-parse --abbrev-ref HEAD || true
```

Build that path from the top-level directory and branch printed above; the sidecar is the same path with `.md` replaced by `.run.jsonl`.
If the plan file does not exist, stop and say so — name the path you looked for, and suggest running `checkpoint-plan` first.
Do not invent a plan, and do not fall back to inferring stages from the diff.
A stage the user never approved is not a stage.

## Step 2: Take the next unticked stage

Read the plan and take the **first** stage whose checkbox is still `- [ ]`.
That one, and only that one.

If every box is ticked, say the plan is complete and stop.

Before building, sanity-check the stage against the current code.
The plan may have been written days ago; if the stage assumes something that is no longer true, that is the "plan is wrong" case — report it and stop rather than improvising around it.

## Step 3: Build it

Implement the stage as written, following the rules in your system prompt.
Treat the plan's `## Decisions` section as settled: build within it, and if the stage cannot be built without breaking one, that is the "plan is wrong" case — report it and stop.
Do not commit — the user commits.

## Step 4: Tick the box and report

Change that stage's `- [ ]` to `- [x]` in the plan file.
Do this only after the work is actually done; the checkbox is the sole record of progress, and a box ticked over unfinished work silently skips a stage.

Then append the stage's sidecar line as the system prompt describes (`blocked` with a note when the plan is wrong and the box stays unticked).

Then report: what changed in a sentence or two, and the one-line commit message for this stage.
