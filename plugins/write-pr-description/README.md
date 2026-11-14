# write-pr-description

`write-pr-description` is a skill that writes a reviewer-focused pull request description from the session and the branch's git history.
Install it with `/plugin install write-pr-description@fixings`.
It has no mod, no hooks and no dependencies; `ship-plan`, from the `checkpoint-plan` plugin, calls it when it opens the PR.

## The skill

`write-pr-description` runs when invoked explicitly while wrapping up a piece of work (model `sonnet`, effort `low`).
It takes an optional `--out <path>`.

It collects `git log` and `git diff --stat` against `origin/HEAD`, detects the language and build toolchain, and resolves the ticket from the session, then from the head of the branch name, then to no ticket.
It only asks the user when none of those answer and the session is interactive; under `ship-plan` it never asks.
The description has four sections, Summary, Out of scope, Judgement calls worth flagging and Test plan, plus an optional Evidence section when a visual shows something the diff and the tests cannot.
A before/after Evidence table gets a derived column computed from its own measured numbers: `speedup ×` for times, rates and higher-is-better counts, `savings %` for sizes, costs and lower-is-better counts, with a marker on a regression and one table per kind when both appear.
A `haiku` sub-agent that sees only the draft then trims it, and the trimmed version is the output, wrapped in one code block.
With `--out <path>`, that version is also written raw to the path.

## Known limits

- When `origin/HEAD` is unset in a clone, the context block prints nothing; the skill says to run `git remote set-head origin -a` and retry.
- `model: sonnet` and `effort: low` are set in the skill's frontmatter, so a session without that model runs it as the harness resolves it.

## What was checked

Run live on 2026-11-13 in a headless `claude -p --plugin-dir plugins/write-pr-description` session, with the installed copy turned off, on the 0.2.0 branch.
The session printed made-up before/after numbers with `printf`: a time gain, a time regression, a higher-is-better count, a lower-is-better count and a size.
The description came out with a `speedup ×` table (4.5×, 0.8× (slower), 1.5×) and a `savings %` table (75%, 36%), every value correct, and both tables survived the trim pass.
That was one run, and model output varies between runs.
The trim pass deleted the Out of scope section, and the drafting step restored it.
`claude plugin validate .` covers its manifest and the skill's frontmatter.
