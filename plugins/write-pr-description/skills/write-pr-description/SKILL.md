---
name: write-pr-description
description: Generates a concise, reviewer-focused PR description from session context and git history. Invoke explicitly when wrapping up a piece of work.
argument-hint: "[--out <path>]"
model: sonnet
effort: low
---

# Write PR Description

## Context Gathering

Before writing, collect the following automatically:

```!
git log origin/HEAD..HEAD --oneline || true
git diff origin/HEAD...HEAD --stat || true
```

If the block above printed nothing or an error, `origin/HEAD` is probably unset in this clone; run `git remote set-head origin -a` and retry.

Detect the primary language and build toolchain from the repository (e.g. `pom.xml` → Maven/Java, `package.json` → Node, `pyproject.toml` -> uv/Python). 
Use this to inform the Test Plan section.

Resolve the ticket reference in this order, and stop at the first one that answers:

1. A ticket referenced during this session, or passed in by whatever invoked this skill.
2. A ticket ID at the head of the branch name (`PROJ-1234-junit-outcome-metrics` → **_PROJ-1234_**).
3. No ticket. This is a normal state — plenty of repos have no tracker at all.

Only ask the user if none of those apply **and** the session is interactive.
If this skill was invoked by `/ship-plan`, the user has walked away: never ask, take option 3, and write the description without a ticket.
A question nobody is there to answer is a stalled run, not a thorough one.

---

## Output Format

Produce a PR description with four `##` sections, plus an optional fifth, Evidence, when it earns its place. No preamble, no sign-off.

Keep each section tight. Reviewers are busy. If a section has nothing meaningful to say, write a single sentence saying so — do not pad it.

---

### ## Summary

One paragraph. 
The 10,000ft view: what problem does this change solve, and what was the approach? 
No implementation detail that belongs in Judgement Calls.

---

### ## Out of scope

A brief bulleted list of related work that was explicitly excluded — either per the ticket description or through discussion during this session. 
If nothing was explicitly scoped out, write: "Nothing explicitly excluded from this change."

Only work that was *explicitly* excluded. 
Everything a PR does not do is infinite; this section is for the exclusions a reviewer would otherwise flag as an omission.

---

### ## Judgement calls worth flagging

The interesting section. 
Call out deliberate choices in a numbered list that reviewers might otherwise question:

- Implementation decisions shaped by existing codebase patterns
- Trade-offs made due to technical constraints or blockers
- Anything where a reasonable reviewer might ask "why did you do it this way?"

If the change had no notable judgement calls, write: "No significant departures from standard patterns."

Each item says what you chose, and why. 
If a choice needs a paragraph to justify, that is a conversation for the review thread, not a monologue in the description.

---

### ## Evidence (optional)

Include this section only when a visual shows something the diff and the tests cannot.
That is usually the change's output on real inputs: a run against real repos or real data, a screenshot of a real UI, the rendered artifact itself.
A demo of behaviour the tests already assert is decoration, not evidence.
Before including anything, ask what a reviewer learns from it that a green test run does not already tell them; if the answer is nothing, omit the section entirely rather than writing "No evidence".

Shape:
- One line on what was run, against what, and the date or commit of the inputs, then one line on the headline a reviewer should take away.
- A table or a short verbatim terminal block, trimmed to what the reviewer needs. Never paste raw verbose output such as full JSON dumps.
- Fold anything longer than about 10 lines under `<details><summary>...</summary>`.
- Only output actually produced this session. If the run has not happened, omit the section and leave an unchecked Test plan box for it; never reconstruct or predict output.

---

### ## Test plan

A checkbox list of concrete testing steps taken during this change. 
Base the tooling on the detected language/framework — do not hardcode Maven unless the project uses it.

Typical entries to consider (adapt to the project):
- Relevant unit/integration test commands (e.g. `mvn -pl <module> test`, `npm test`, `pytest`)
- Notable test coverage added or intentionally omitted (with reason)
- `CHANGELOG.md` and versioning bumps if applicable
- Manual testing steps with enough detail to reproduce
- Show the delta of new tests added with this PR

Format:
```
- [ ] `<test command or action>`
- [ ] Verified <behaviour> manually via <method>
```

---

## Formatting Rules

Apply these consistently throughout:

- Any codebase keyword (service names, modules, CLI tools, config keys, technology names) → wrap in backticks: `evalsctl`, `auth-service`, `FEATURE_FLAG_X`
- Any ticket reference → bold + italic: **_PROJ-1234_**
- Only link to PRs, tickets, or other resources if they were explicitly discussed during this session or appear in the git context — use standard markdown links: `[PROJ-1234](<the ticket's URL>)`
- No filler phrases ("This PR aims to...", "As part of this work...", "It is worth noting...")
- wrap the entire output in one code block to expose markdown formatting for copy paste
- try to refrain from using em dashes unless absolutely necessary
- do not hard-wrap prose at a fixed column width (e.g. 80 chars), write each paragraph as one continuous line and let the GitHub renderer soft-wrap it.

---

## Trim pass

The context that just wrote the description is the worst judge of what to cut from it.
It chose every sentence on purpose, so asked to trim, it will shorten a word and keep the paragraph.
So the draft goes to a sub-agent that has no attachment to it.

Spawn **one** `general-purpose` Agent with `model: "haiku"` and `effort: "low"`, and give it the drafted description and nothing else.
Do not give it the diff, the commit log, the ticket, or any of the session context.
That blindness is the whole point: a reviewer opening this PR sees only these words, so only these words get to justify themselves.
An agent that can see how much work went in will argue for keeping the description of it.

Give it this instruction:

> *"Below is a draft pull request description. Cut it down. Default to deleting any sentence unless it changes what a reviewer would do — what they look at, what they question, what they run. Delete: anything restating the diff, any sentence explaining why a choice was reasonable rather than what the choice was, any preamble, any sentence that would survive unchanged on a different PR, and any adjective doing no work. Enforce these limits, cutting whole items rather than shortening every line: Summary 3 sentences, Out of scope 4 bullets, Judgement calls 4 items of 2 sentences, Evidence (if present) at most two lines of prose around one table or block with anything longer folded, Test plan one line per checkbox with no prose. Preserve all markdown formatting, backticks, links, and section headings exactly. Return the trimmed description only, with no commentary."*

Post the returned version, not your draft.
If the agent cut something you believe a reviewer genuinely needs, put that one thing back and say which, rather than restoring the draft wholesale.

With `--out <path>`, write that final version, raw and unfenced, to the path.
