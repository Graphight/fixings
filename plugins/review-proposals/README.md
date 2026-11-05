# review-proposals

`review-proposals` is a skill that reads every open proposal in a project's `docs/proposals/` at once and reports what only shows from that height.
Install it with `/plugin install review-proposals@fixings`.
It has no mod, no hooks and no dependencies; it pairs with the `write-proposal` plugin, whose proposals it reviews.

## The skill

`review-proposals` runs in a forked context (`context: fork`, model `fable`, effort `xhigh`) when asked to "review the proposals", for a "big-picture check on the proposals" or "what's the state of the backlog?".
It reads every file in `docs/proposals/` and `docs/decisions/`, skips proposals marked done, rejected or superseded, and takes a proposal with no recorded status as open, saying it assumed so.
It finds the project's vision in the README, then any vision or goals doc under `docs/`; with none it says `no vision stated` and skips the vision check.

It then runs seven checks, citing proposals and decisions by filename in every claim: conflicts, overlaps, order, too large, vision drift, decision clashes (deliberate or unacknowledged) and stale premise.
A proposal with more than one independent reason to ship is split into named pieces, with the piece that ships first.
The report opens with a three-to-five line summary, gives one section per check that found something, lists the checks that found nothing in one line, and ends with a recommended order of work.

## Known limits

- `model: fable` and `effort: xhigh` are set in the skill's frontmatter, so a session without that model runs it as the harness resolves it.
- A project with no `docs/proposals/` gets a one-line answer and no review.
- The skill reads the code only where a claim needs checking, so a stale premise it cannot see from the docs is not raised.

## What was checked

Not run live from this plugin: no session has loaded it from fixings and run it against a set of proposals.
`claude plugin validate .` covers its manifest and the skill's frontmatter.
