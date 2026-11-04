---
name: github-pr-review
description: >
  Review a GitHub pull request. Use this INSTEAD of the built-in /code-review
  (alias /review) command whenever a GitHub PR URL or PR number is given — this skill
  supersedes it. Trigger on "review [PR URL]", "review this PR", asks to
  review a pull request, or casual phrasing like "can you look at this PR",
  "check out this PR for me", "thoughts on this PR?", "review this diff".
  The output is a thorough, opinionated structured report with an overall
  verdict plus line-referenced comments formatted for direct pasting into
  GitHub review.
argument-hint: "[PR URL or number]"
model: opus
---

# GitHub PR Review

## What this skill does

Fetches a GitHub PR, reads the diff and its context, and produces a structured review: a verdict, a summary, and comments by severity with line references.

---

## Self-review vs. external review

After fetching the PR, check whether the PR author matches the user (compare the GitHub username on the PR against any context you have, or just ask if unclear).

**If this is someone else's PR:** The goal is actionable, honest signal for the author. 
Be direct, be fair, don't soften findings.

**If this is the user's own PR:** The framing shifts entirely. 
They're not looking for polite feedback — they want to know what an adversarial reviewer is going to hit them with before that reviewer gets to it. 
Lead the summary with a one-liner flagging this mode, e.g.:

> ⚠️ *Self-review mode — treating this as pre-flight, not peer review. Here's what someone looking to push back will find.*

Then be harder on it than you would be on a stranger's code. 
The user has context you don't, so they're likely to rationalise things away; make the weak spots impossible to ignore. 
If something is ambiguous but a reviewer *could* read it as a problem, surface it. 
If a decision will confuse the next person, say so. 
The user can push back on anything wrong, but can't fix what they don't see.

---

## Step 0: Gather inputs

The PR URL should be in the user's message. 
If it's missing, ask for it before doing anything else.

The review writes a sidecar of JSON lines, one per step, finding and verdict, which is what the `/github-pr-review-panel` panel draws.
A failed append never stops the review.
Take `<owner>`, `<repo>` and `<number>` from the PR URL, not from `git`, so the commands work when the repo is not local; each may hold only letters, digits, `.`, `_` and `-`.
Create the file empty:

```
bash ${CLAUDE_SKILL_DIR}/scripts/sidecar.bash ~/.claude/reviews/<owner>-<repo>-<number>.jsonl init
```

Every sidecar call in this skill goes through that script, and the panel finds the file by the path in the call itself, so write the path out in full on every call; do not shorten it to a variable.
Free text (a title, a path, a claim, a `why`) goes in a quoted heredoc, `<<'EOF'`, one value per line in the order shown, never in a double-quoted argument, where the shell would run backticks and `$(...)` from a PR title or claim.
The `step` and `done` kinds take their value as an argument, because it is one of the fixed words listed in this skill.
Write a `step` line at the start of each step below, named `fetch` (Step 1), `analyse` (Step 2), `prove` ("Prove the new tests"), `verify` (2.5a), `cull` (2.5b) and `report` (Step 3); a step that is skipped writes no line:

```
bash ${CLAUDE_SKILL_DIR}/scripts/sidecar.bash ~/.claude/reviews/<owner>-<repo>-<number>.jsonl step <step name>
```

Ask only if relevant to what you find: whether the reviewer has the repo locally, and whether tests have been run against this branch.

---

## Step 1: Fetch the PR

Write the `fetch` step line.
Once you have the title and the head SHA, write the `pr` line, with `number` a number and `head` the short SHA:

```
bash ${CLAUDE_SKILL_DIR}/scripts/sidecar.bash ~/.claude/reviews/<owner>-<repo>-<number>.jsonl pr <<'EOF'
<number>
<title>
<PR URL>
<short head SHA>
EOF
```

Fetch with `gh` first, using `WebFetch` on the GitHub URLs only if `gh --version` fails. Retrieve:

1. **The PR description and metadata** — `gh pr view {number} --repo {owner}/{repo} --json title,body,baseRefName,headRefName,commits,files`. Read the body in full. This is where the author explains intent, calls out known tradeoffs, links context, and pre-empts objections. Fallback: `https://github.com/{owner}/{repo}/pull/{number}`.
2. **Every comment chain** — read all review comments, inline-thread replies, and issue comments end to end, including resolved threads: `gh api repos/{owner}/{repo}/pulls/{number}/comments`, `gh api repos/{owner}/{repo}/issues/{number}/comments` and `gh pr view {number} --repo {owner}/{repo} --json reviews`. A question you are about to raise may already be answered here; a concern a reviewer already raised may already be agreed or dismissed.
3. **The PR diff** — see the warning below; get it from a source that carries real line anchors, not the rendered HTML page.
4. **Individual file contents as needed** — when a change looks odd, fetch the full file to understand the surrounding context: `gh api repos/{owner}/{repo}/contents/{filepath}?ref={branch}` (fallback `https://github.com/{owner}/{repo}/blob/{branch}/{filepath}`).

If the repo is private and access fails, tell the user and stop.

### Get the diff from a source with real line numbers

The rendered `/files` HTML page is the wrong source for line numbers: the number sits in a gutter beside the code, and flattened to text the number-to-code link smears, so reviews cite lines off by a whole hunk.

Get the diff from a source that carries the line anchors instead, in order of preference:
- **`gh` available** — run `gh pr diff {number}`. This emits a unified diff with `@@ -old,+new @@` hunk headers. The new-file line number is the `+new` start, incremented by one for every context and added (`+`) line, and *not* for deleted (`-`) lines. Count deterministically; never guess.
- **Repo is local** — `grep -n` or Read is only ground truth if the working tree is at the PR's head commit (`git rev-parse HEAD` matches `gh pr view {number} --json headRefOid`).
  When reviewing someone else's PR it usually is not: the files on disk are your own branch, or `main`, and their line numbers belong to a different version.
  Read the PR's version instead with `git show <head-sha>:<path>`, after `git fetch origin pull/{number}/head` if the commit is not local.
- **Web only, no `gh`** — fetch the raw patch at `https://github.com/{owner}/{repo}/pull/{number}.diff` and count from the hunk headers as above. Do not read line numbers off the rendered `/files` page.

### Gate: read before you judge

Do not form a verdict or write a single comment until you have actually read the description (item 1) and every comment chain (item 2), not just the diff.
Skipping this produces reviews that flag things the author already explained or re-raise points settled in the threads.
Before Step 2, confirm: *I have read the PR body and all comments, and nothing below contradicts what I'm about to say.*
If a finding you reach in Step 2 is already addressed in the description or a comment, either drop it or reframe it as engaging with what was said — never present it as if the discussion didn't happen.

---

## Step 2: Analyse the diff

Write the `analyse` step line.
Then write a `finding` line for each candidate as you raise it, before it is verified.
`id` is a running number you give each candidate, starting at 1; it is not the comment number in the final report.
`tier` is one of `BLOCKING`, `IMPORTANT`, `SUGGESTION`, `NIT`, `QUESTION`, and `line` is a number:

```
bash ${CLAUDE_SKILL_DIR}/scripts/sidecar.bash ~/.claude/reviews/<owner>-<repo>-<number>.jsonl finding <<'EOF'
<id>
<tier>
<path>
<line>
<the claim, one sentence on one line>
EOF
```

Work through the diff systematically. 
For each changed file, read:
- What changed and why (infer intent from the diff)
- What the surrounding code looks like (fetch it if the diff context window is too narrow)

### Verify every factual claim before you write it down

A finding is only as good as the fact underneath it, and a single wrong fact makes the whole review look careless. 
Before you state ANY claim, check it against the actual source — never assert from memory or assumption:

- **Line references** — open the PR head's version of the file (see Step 1, never an arbitrary working tree) and confirm the line number and the content match what you're about to cite.
- **Method / API / version availability** — confirm against the dependency version actually in use. A method added in junit 5.12 is not available on 5.11; check the real version before claiming a symbol exists or is missing.
- **Nullability and contracts** — read the real type/contract in *this* language. Do not carry assumptions across stacks; a field being optional in a React component tells you nothing about whether a Java DTO field is nullable.
- **Call sites** — if a change affects callers, grep for every call site before asserting impact (or safety). If the repo is local and an LSP is available for the language, prefer find-references over grep — it resolves real call sites through the type system instead of matching on name text, catching dynamic dispatch and interface implementations grep would miss.

If you cannot verify a claim, either go and verify it or downgrade it to an explicit question ("is X intended?") rather than stating it as fact.

### When something looks odd

Before flagging it as a problem, check whether it's a codebase pattern:
- Fetch the wider file or a related file to see if the same pattern appears elsewhere
- If the pattern is endemic, **still surface it** — but frame the finding as "this is consistent with the codebase pattern, but the pattern itself has a problem" rather than blaming the PR author for it
- The severity may be lower if fixing it is out of scope for this PR; say so explicitly

### What to look for

**Correctness**
- Logic errors, off-by-one errors, incorrect conditionals
- Race conditions, concurrency issues
- Broken error handling (swallowed exceptions, misleading error messages)
- Security issues: injection vectors, trust boundary violations, exposed secrets, unsafe deserialization

**Design**
- Does the abstraction make sense? Is the right thing being changed?
- Unnecessary coupling, violation of existing patterns without justification
- Premature abstraction or over-engineering relative to the scope

**Robustness**
- Edge cases that aren't handled
- Missing input validation
- Behaviour under failure conditions

**Tests**
- Are new code paths covered? Don't just say "needs more tests" — identify the specific scenario that isn't tested
- Example of a good test comment: *"The retry logic in `fetchWithBackoff` has no test for the case where all retries are exhausted — the function returns `undefined` but callers appear to expect a thrown error."*
- Example of a bad test comment: *"Could use more test coverage."* — never write this
- If the change is trivial (renaming, config tweak, comment edit), skip the tests section

**Documentation**
- Only flag missing docs when: (a) a public API surface changed, (b) a non-obvious behaviour was introduced, or (c) an existing doc comment is now wrong
- Don't flag missing docs for internal implementation details or when the code is self-explanatory

### Prove the new tests

If the PR adds or changes test cases and the repo is local, check that those tests can actually fail.
Reading a test is not enough: a test that asserts a mock's own stubbed value reads fine and passes forever.

Write the `prove` step line before spawning the agent.
Spawn one `general-purpose` Agent with `model: "sonnet"` and give it:
- The repo path, the PR number, and the head SHA.
- This instruction: *"Run `git fetch origin pull/{number}/head`, then `git worktree add <scratchpad>/pr-{number} <head-sha>`. Inside that worktree, invoke the `prove-tests` skill with `--report-only --max 10 --sidecar <the literal sidecar path>`, scoped to the test cases this PR adds or changes. Return the skill's report table, its unchecked list, and the count of in-scope tests. Remove the worktree with `git worktree remove` when done."*

The cap of 10 keeps a PR that adds fifty tests from turning the review into a mutation-testing run; the unchecked list makes the gap visible instead of silent.

Skip this step when the repo is not local, the PR touches no tests, or the change is trivial.
If the agent reports that tests cannot be run locally, put "Tests not mutation-checked: <reason>" in the Test coverage line of the report and move on.

Each test that **survived** its mutation becomes an `IMPORTANT` finding on the test, stating the mutation it let through.
The mutation run is the evidence, so these findings skip the 2.5a verifier; still read the agent's mutation and result yourself before accepting it.
Write each as a `finding` line and a `kept: true` `verdict` line together, with the mutation as the `why`.
A test **killed for the wrong reason** becomes a `SUGGESTION` only if you can say what the test should be asserting instead.

---

## Step 2.5: Verify findings with independent sub-agents

The context that generated a finding is the worst judge of whether it's real — it already believes it.
Self-review fails for exactly this reason: a mind can't find its own blind spot by trying harder.
So before writing the report, hand each significant finding to a sub-agent that did *not* generate it and has no stake in defending it.

Every finding gets refuted by someone else before it reaches the report.
The high tiers get a verifier each; the low tiers get one shared culler, because a nit is not worth its own sub-agent.

### 2.5a — Verify `BLOCKING` and `IMPORTANT`, one agent each

For each `BLOCKING`/`IMPORTANT` finding, spawn a `general-purpose` Agent (run them in parallel — one message, multiple tool calls). Give it **only**:
- The claim, stated in one sentence.
- The file path and the specific lines it concerns.
- The PR's head SHA.
- This instruction: *"Verify this claim against the source. Your job is to REFUTE it. Default to `refuted: true` unless the code in front of you forces you to confirm it. Read the PR's version of the file with `git show <head-sha>:<path>`, not the working tree, which may be a different branch. Report the exact text of the line(s) the claim concerns. Return `{refuted: bool, why: <one line>, quote: <exact line text>}`."*

Do **not** pass your own reasoning for the finding — just the claim and the code.
The independence is the whole point; if the verifier sees why you believed it, it inherits your blind spot.

Then anneal:
- Finding survives (`refuted: false`) → keep it, citing the line number you counted from `gh pr diff` (Step 1).
  Check that the diff's text at that line matches the verifier's `quote`; if it does not, find the diff line that does before citing it.
  Never take a line number from the working tree, which may not be the PR's version of the file.
- Finding refuted → drop it, or demote it to an explicit question if the verifier's `why` shows it's ambiguous rather than wrong.

### 2.5b — Cull `SUGGESTION`, `NIT`, and `QUESTION` in one batch

These are the findings that bloat a review, and the context that wrote them is the last thing that should judge them.
Spawn **one** `general-purpose` Agent and hand it the whole list at once — for each item, only its tier, its one-line claim, and the file and lines it concerns, plus the PR's head SHA.
Do not pass your reasoning, and do not pass the `BLOCKING`/`IMPORTANT` findings; a long list of serious findings makes a nit look load-bearing by association.

Give it this instruction:

> *"Each item below is a candidate review comment on a pull request. Your job is to CUT them. Default to `cut: true` unless the code in front of you forces you to keep it. Read the actual lines in the PR's version of the file (`git show <head-sha>:<path>`, not the working tree) before deciding. Cut it if: the author would reasonably call it pedantic; the code is already fine as written; it restates something obvious from the diff; it is a matter of taste with no concrete cost; it asks for a change with no stated benefit; or it is already the established pattern in this file. Keep it only if you can name the concrete cost of leaving the code as it is. A comment that survives must earn a reviewer's name on it. Return an array of `{id, cut: bool, why: <one line>, quote: <exact line text>}`."*

Then apply it:
- `cut: true` → the finding is gone. Do not rescue it by demoting it a tier; a refuted nit is not a smaller nit, it is noise.
- `cut: false` → keep it, citing its line number from `gh pr diff` and checking the text there matches the culler's `quote`.

Trust the survivors; the ones that didn't survive were the noise.

Do not start Step 3 until every verifier and the culler has reported back; count them out and in, or late notifications wake the session for empty turns.

Before the verifiers go out, write the step line (`verify` for 2.5a, `cull` for 2.5b).
Write a `verdict` line as each verifier or the culler reports.
`kept` is `true` with their `why` for a finding that survives, and `false` for one refuted or cut.
A finding demoted to a question after refutation is a `kept: false` verdict on the old `id` and a new `finding` line:

```
bash ${CLAUDE_SKILL_DIR}/scripts/sidecar.bash ~/.claude/reviews/<owner>-<repo>-<number>.jsonl verdict <<'EOF'
<id>
<true|false>
<their why, on one line>
EOF
```

---

## Step 3: Produce the report

Write the `report` step line, then, once the verdict is settled and before printing the report, the `done` line.
`verdict` is the word exactly as the report prints it: `APPROVED`, `COMMENT` or `CHANGES REQUESTED`.

```
bash ${CLAUDE_SKILL_DIR}/scripts/sidecar.bash ~/.claude/reviews/<owner>-<repo>-<number>.jsonl done "<APPROVED|COMMENT|CHANGES REQUESTED>"
```

Use this structure exactly:

---

### PR Review: {PR title} (#{number})

**Verdict:** `[APPROVED | COMMENT | CHANGES REQUESTED]`

Use these thresholds:
- `APPROVED` — no blocking issues; any comments are nits or suggestions
- `COMMENT` — no hard blockers but something worth discussing before merge
- `CHANGES REQUESTED` — at least one blocking issue

**Summary**

2–4 sentences. 
What does this PR do, does the approach make sense, and what's the headline concern if any. 
Be direct — this is the first thing the author reads.

---

### Comments

Order all comments by severity tier, highest first. 
Within a tier, order by file.

Number every comment with a single running count — `1, 2, 3, …` straight down the whole list, *not* restarting per tier. This gives the author a stable handle to reply against ("2: agreed", "5: ignoring this"), so the numbers must be unique across the entire review.

Each comment uses this format. For `BLOCKING`, `IMPORTANT`, `SUGGESTION`, and `QUESTION`:

````
**N. [TIER] filename.ext, line L (or lines L–M)** — <one-line finding>
Why it matters: <the principle or doctrine this breaks, not a restatement of the finding>
Suggested comment:
```markdown
BLOCK:/IMP:/SUG:/QUE: <the context — what the code does and why it is a problem, stated flatly>

<the ask — the question or concrete request, on its own line after a blank line>
```
````

`QUESTION` uses this same format, "why it matters" included — the "why" is what stops a stray thought from becoming a comment. Reach for `QUESTION` instead of `SUGGESTION`/`IMPORTANT` whenever what you actually want is intent confirmed or a thumbs-up, not a code change; the suggested comment should read as a question answerable with yes/no or a reaction.

`NIT`s stay terse — they're already paste-ready, and wrapping a one-line nit in "why it matters" is the ceremony this review is meant to avoid:

````
**N. [NIT] filename.ext, line L**
```markdown
NIT: <the nit, e.g. rename `tmp` to `parsedDate`>
```
````

Rules that keep the block from bloating:
- **Why it matters** names what the change *violates* — a contract, an invariant, a team convention — not a paraphrase of the finding. If the only "why" you can write is the finding again, the finding wasn't worth a comment.
- **Suggested comment** is what you'd actually post: an ask or a question the author can act on, not a restated verdict. Keep it to a sentence or two.
- **Suggested comment** always sits inside its own fenced code block (as shown above), never a blockquote. A terminal renders `` `backticks` `` and `**bold**` inside a blockquote by *applying* the styling and hiding the syntax characters, so a copy from a rendered blockquote grabs plain text with no markdown left in it. A fenced code block is shown as literal, unstyled text, so the backticks and asterisks are still there to select and paste. Write the comment body in real GitHub-flavored markdown inside that fence, wrap identifiers, filenames, and code fragments in backticks, and use bold where it earns its place, so what lands in the GitHub comment box renders correctly there.
- **Suggested comment**'s fence opens with the `markdown` tag, exactly as shown above. A renderer that knows a fence's language can frame it and offer a Copy button; a fence with no tag gets neither. The tag is not part of what gets copied.
- **Suggested comment** splits into two paragraphs separated by a blank line: the context first, then the ask. The context states what the code does and why that is a problem; the ask is the question or concrete request, and it sits alone after the blank line so the author can see what is wanted of them without re-reading the setup. A comment with no context to give (most `NIT`s) stays a single line — do not manufacture a preamble just to have something above the break.
- **Suggested comment** wraps only at that paragraph boundary. Each paragraph is one continuous line inside the fence — no manual line break at a fixed column (the ~80-char habit). Let the terminal or GitHub soft-wrap within a paragraph. A hard break inserted mid-sentence survives the paste and shows up as a broken line inside the GitHub comment box, which is exactly what the fence is meant to prevent. The blank line between context and ask is a deliberate paragraph break at a sentence boundary and is not the same thing.
- **Suggested comment** is polite in the ask and flat in the claim. The ask carries the manners — "could we please", "would you mind", "is it worth" — because it is a request to another person, not an instruction to a build system. The context does not: a finding that survived verification is stated as fact, so no "potentially", "probably", or "might be" is allowed to creep in front of it. Hedging the ask is courtesy; hedging the claim throws away the work that established it was real. If a claim genuinely is uncertain, it belongs in a `QUESTION`, where the uncertainty is the point, rather than smuggled into a `BLOCK:` as a soft word.
- **Suggested comment** has zero em dashes and zero AI-isms — no "delve," "leverage," "robust," "seamless," "furthermore," "it's worth noting," or similar filler. It's going out under the reviewer's name, so it reads like a person typed it in the GitHub UI, not like a model wrote it.

The four tiers:

| Tier | Label | Meaning |
|------|-------|---------|
| 1 | `BLOCKING` | Must be fixed before merge. Correctness bugs, security issues, data loss risk. |
| 2 | `IMPORTANT` | Should be fixed. Won't cause immediate breakage but creates real risk or debt. |
| 3 | `SUGGESTION` | Worth considering. Design feedback, better approaches, non-critical edge cases. |
| 4 | `NIT` | Take or leave. Style, naming, minor consistency issues. |
| 5 | `QUESTION` | Not a change request — a yes/no check on intent, or an ask for a thumbs-up acknowledgement. |

Every suggested comment opens with the tier's short tag, so it stays unambiguous once it's pasted out of this report and into GitHub on its own: `BLOCKING` → `BLOCK:`, `IMPORTANT` → `IMP:`, `SUGGESTION` → `SUG:`, `NIT` → `NIT:`, `QUESTION` → `QUE:`.

**Calibrate before you assign a tier.** 
The default for a marginal finding is to drop it, not to flag it at a low tier. 
A review buried in pedantic noise gets the real issues ignored. 

- Only raise a finding you can defend with concrete evidence; if the strongest case you can make is "someone *might* prefer X", it isn't worth a comment.
- Do not flag choices that are forward-looking by design (a hook left for a planned follow-up, a deliberately generic interface) as if they were omissions — if intent is plausible, ask rather than fault it. Use `QUESTION`, not `SUGGESTION`/`IMPORTANT`, whenever the honest ask is "was this intentional?" rather than "please change this."
- Do not treat routine mechanics — version bumps, registry/config entries, generated files — as problems unless something is actually wrong with them.
- Before writing a `SUGGESTION` or `NIT`, ask: would the author reasonably call this pedantic? If yes, cut it.

**There is no comment quota, and a short review is not a lazy one.**
The failure mode to watch for in yourself is the urge to look thorough.
A long list of comments reads as diligence, so there is a pull toward topping up a thin review with observations that are true but cost the author nothing to ignore — a `SUGGESTION` restating a design choice back at them, a `QUESTION` asking about something the diff already makes obvious.
That is padding, and it does the opposite of what it looks like: every filler comment spends a little of the author's trust, so by the time they reach the finding that mattered they are skimming.

So:
- Zero `SUGGESTION`s and zero `QUESTION`s is a normal, correct outcome. Most good PRs earn none of either.
- A `SUGGESTION` needs a concrete cost of leaving the code as it is, stated in the "why it matters" line. "This could be structured differently" is not a cost. If you cannot name what goes wrong, there is no suggestion.
- A `QUESTION` is only warranted when the answer would actually change something — your verdict, or a comment you would otherwise write. If both a yes and a no leave the review identical, do not ask it.
- Never comment to demonstrate that you read a file. The verdict already says you read it.
- If the whole review is one `BLOCKING` comment and nothing else, ship that. One real finding, cleanly stated, is a better review than one real finding buried in six polite ones.

**Line reference format for GitHub paste:**

When writing a comment intended for pasting into a GitHub line review, format it so the author knows exactly where to look:

````
**3. [BLOCKING] src/auth/token.ts, line 42** — `req.query.token` flows into a raw SQL query unsanitised
Why it matters: it bypasses the parameterised ORM layer above it, so it is an injection hole even though the surrounding code looks safe. Raw request params never go into raw SQL.
Suggested comment:
```markdown
BLOCK: This passes `req.query.token` straight into a raw query, around the ORM's parameterisation that every other call site goes through. A request param reaching raw SQL is an injection hole regardless of how safe the surrounding code looks.

Could we please route this through the `db.escape()` helper, or use a prepared statement?
```
````

If a comment spans a range of lines, write `lines 38–45`.

If there are zero issues in a tier, omit that tier entirely — don't write "No nits found."

---

### Test gaps (if any)

If the PR adds or changes tests, open this section with one line, even when there are no other gaps:

```
Test coverage: mutation-checked N of X new or changed tests (unchecked: <names>)
```

Drop the `unchecked` part when N equals X.
When the check could not run, the line reads `Test coverage: not mutation-checked (<reason>)` instead.

List specific untested scenarios as bullet points. 
Each bullet names the function/path and the missing case. 
Skip this section if there are no meaningful gaps.

---

### Docs (if any)

Only include if a public API changed, a non-obvious behaviour was introduced, or an existing doc comment is now wrong. 
Skip otherwise.

---

## Tone guidance

Code review, not performance review. 
Comments are about the code, not the author. 
Direct is good; dismissive is not. 
If a tradeoff is genuinely hard, say so. 
If you're uncertain whether something is a bug or intentional, ask rather than assert.
Try to refrain from using em dashes unless absolutely necessary. 
Do not use contractions anywhere in the generated review — write "do not" rather than "don't", "cannot" rather than "can't", "it is" rather than "it's", and so on throughout the summary, findings, and suggested comments.

In self-review mode, lean harder into ambiguities rather than giving benefit of the doubt — the author already gave themselves that. 
The useful question is: *what would a sceptical reviewer make of this?*

Don't pad the review. 
If the PR is clean, say so and stop.