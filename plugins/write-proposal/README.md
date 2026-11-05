# write-proposal

`write-proposal` is a skill that turns an idea into a proposal in a project's `docs/proposals/`, after reading the code and interviewing you on the behaviour you expect.
Install it with `/plugin install write-proposal@fixings`.
It has no mod and no hooks; it pairs with the `review-proposals` plugin, which reviews the proposals it writes.

## The skill

`write-proposal` runs (model `opus`, effort `high`) when asked to "write a proposal for X", "propose X" or "turn this idea into a proposal", and takes the idea as its argument.

1. It reads the repo's `docs/README.md` for the template.
   With none, it stops and asks whether to scaffold `docs/`; on a yes it writes `docs/README.md` from `reference/docs-readme.md` and creates `docs/proposals/README.md` and `docs/decisions/`.
2. It reads the code the idea touches, the proposals index and every open proposal, and the decisions the idea touches.
   If the idea is already built or an open proposal covers it, it says so and stops.
3. It interviews you on the decisions the idea raises, plus two only a proposal has: whether the idea is too large and should split, and where each proposal goes in the build order.
4. It writes `docs/proposals/<topic>.md` in the repo's template, once per proposal the interview settled, adds each one's entry to the index, and leaves git to you.

## The interview

Install `interview` with `/plugin install interview@fixings` and the skill runs it, with its round rows.
Without it, the skill interviews you itself in plain `AskUserQuestion` rounds until every decision is settled.

## Known limits

- The status word is the first option of the template's `Status:` line, so a template whose first option is not the initial state gives the wrong word.
- It needs `docs/README.md` to hold the template; the scaffold copy in `reference/docs-readme.md` is the only fallback.

## What was checked

Two live runs on 2026-11-04, each a `claude -p` session loaded with `--setting-sources project,local --plugin-dir` from this checkout, in a scratch repo holding a one-line `hello.py`, fixings' `docs/README.md` and one open proposal for a `--name` flag.
Both were asked `/write-proposal make hello.py print a localised greeting chosen by a --lang flag`, and a script answered every question with its first, recommended option, so the runs check the flow, not the quality of the answers.

- With only this plugin loaded, the skill interviewed in two plain `AskUserQuestion` rounds, the second holding the build-order question, then wrote `docs/proposals/localised-greeting.md` and added it to the index as entry 2, after the `--name` proposal.
- With `interview` loaded beside it, the skill ran the `interview` skill, which announced two rounds, asked a scope question in round one and the split and build-order questions in round two, and the skill wrote the same file and index slot.
- Both proposals carry `Status: Proposed`, the first status in that `docs/README.md` template, and a `Reflects` line naming the files read and the commit.

The interview's round row was not seen, since a `-p` session draws no terminal.
`claude plugin validate .` covers its manifest and the skill's frontmatter.
