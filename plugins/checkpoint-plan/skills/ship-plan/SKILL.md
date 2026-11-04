---
name: ship-plan
description: Run an approved checkpoint plan to completion unattended — every remaining stage, a commit per stage, then push and open the PR. Invoke explicitly, e.g. "/ship-plan", "ship the plan", "run the rest of the plan and open the PR".
model: sonnet
effort: medium
---

# Ship Plan

Take a plan that `checkpoint-plan` already staged and the user already approved, and carry it to a pull request without coming back for permission.

`execute-stage` halts after every stage so the user can review and commit.
That halt is right when the plan is new or the work is delicate.
This skill is the other case: the plan is trusted, the user has walked away, and the review gate has moved to the PR.

Invoking this skill **is** the user's standing authorisation to commit and push on their behalf for the duration of the run.
Do not ask again per stage.
This authorisation covers this run only — it does not carry into the rest of the session.

## Step 0: Check it is safe to run unattended

Three things, before any work:

```!
git rev-parse --abbrev-ref HEAD || true
git status --porcelain || true
git rev-parse --show-toplevel || true
```

Stop and say why if:
- the branch is `main` or `master` — this skill commits, and it will not commit there,
- the working tree is dirty — uncommitted work would land inside the first stage's commit,
- there is no plan file at `~/.claude/plans/<repo>-<branch>.md` (`<repo>` is the last part of the top-level path above, `<branch>` the branch with `/` replaced by `-`) — name the path you looked for and suggest `checkpoint-plan`.

Do not offer to work around any of the three.

Then work out how this repo verifies itself, because every commit below is gated on it.
Look in this order:

1. The repo's `CLAUDE.md` or `AGENTS.md` — a build or test command written there is the authoritative one, and it beats anything you would infer.
2. The toolchain, if neither says: `pom.xml` → `mvn test`, `package.json` → its `test` script, `pyproject.toml` → `pytest` or the configured runner, and so on.
3. Nothing found.

Say which command you settled on, in one line, before starting.

Then record it in the sidecar, the plan file's path with `.md` replaced by `.run.jsonl`, which this plugin's `/plan-timeline` pane reads for the gate command:

```
SIDECAR=<the sidecar path>
jq -nc --arg command "<the test command>" '{kind:"gate",command:$command}' >> "$SIDECAR"
```

If nothing turns up, say that too — plainly, as "no test command found, stages will not be verified" — and carry on ungated.
Do not invent a command and do not silently drop the gate.
An unverified run is a legitimate choice on a repo with no tests; an unverified run the user thinks was verified is how a confidently broken PR gets opened.

## Step 1: Loop the stages

While the plan file still has an unticked `- [ ]` stage:

1. Say which stage is starting, as `Stage <n>/<total>: <title>`.
2. Call the Skill tool with `skill: execute-stage` — do not build the stage yourself inline. It runs forked in the `plan-executor` agent (`context: fork`), which takes the next unticked stage, builds it, ticks the box, and reports a one-line commit message.
3. Run the test command as a Bash call of its own, with nothing appended or piped after it, and check its **exit status**, not its output. A truncated or piped log can print reassuring lines and still exit non-zero, and an appended `echo` replaces the exit status with a success, which is the status both this skill and this plugin's `/plan-timeline` pane read.
4. If it passed, commit exactly what that stage changed using the message it reported, and go round again.
5. If it failed, append the halt line below, then stop the loop. Leave the stage uncommitted so the broken work is visible in the working tree, and report which stage broke and the failure output.

The commit is gated on the tests, and that ordering is the point.
Committing first and testing after would leave a broken commit in the history of a branch nobody was watching.

One stage per iteration, committed before the next one starts.
That is what keeps the history cherry-pickable — a single commit holding three stages is the thing this whole plan structure exists to avoid.

Stop the loop and report, mid-plan, if:
- `execute-stage` says the plan is wrong for the current code — that is a decision for the user, not a thing to improvise past,
- the test command fails after a stage,
- `execute-stage` returns without ticking its box, or ticks it having changed nothing.

On any of those, first append a halt line to the sidecar, which the pane reads for why the run stopped and what it needs:

```
SIDECAR=<the sidecar path>
jq -nc --argjson stage <stage number> --arg reason "<why it stopped>" --arg needs "<what it needs from the user>" '{kind:"halt",stage:$stage,reason:$reason,needs:$needs}' >> "$SIDECAR"
```

Then leave the work committed up to the last good stage and say which stage stopped it and why.
Do not push a broken branch, and do not open a PR on one.

## Step 2: Push once, at the end

Push the branch after the loop finishes, not after each stage.
One push is one CI run; the per-stage history is already in the commits.

## Step 3: Open the PR

Invoke `write-pr-description` with `--out <a path in the scratchpad directory>`, telling it the ticket ID from the branch name — or telling it explicitly that there is no ticket, so it does not stop to ask you while you are away.

Then open the PR with what it returns:

```
gh pr create --draft --title "<the plan file's H1>" --body-file <the --out path>
```

If `write-pr-description` is not available, skip it and open the PR with `gh pr create --draft --fill` instead.

Always open it as a draft — the user runs their own review bot over it before colleagues are invited to comment, and marks it ready themselves.

If a PR already exists for the branch, update its description rather than creating a second one.

## Step 4: Report

The user has been away. Give them, in this order:

1. The PR link.
2. One line per stage: the commit message, and whether it went as planned, read from the sidecar's stage lines rather than from memory.
3. Anything that would change what they do next — a stage that diverged, a test skipped, a decision taken in their absence.

Nothing else. No recap of the plan, no list of files touched.

## Notes

- The plan file is the source of truth for progress, both while running and if the loop dies partway. Re-invoking picks up at the first unticked box.
- This plugin's `/plan-timeline` pane draws the progress bar from the plan file's checkboxes, so do not mirror the stages into a todo list.
- The per-stage halt is not gone — it lives in `execute-stage`. Use that one for a plan you have not run before, and this one for a plan you have.
- This skill does not review its own work. That is deliberate: the PR is the review.
