# prove-tests

`prove-tests` is a skill that breaks the code a test guards, one small mutation at a time, and checks the test fails at the assertion and for the reason predicted.
Install it with `/plugin install prove-tests@fixings`.
It has no mod, no hooks and no dependencies; the `github-pr-review` plugin calls it to check the tests a pull request adds.

## The skill

`prove-tests` runs when asked "are these tests real?", "can these tests fail?" or to "prove the tests", and after tests are written in a session (model `opus`, effort `high`).
It takes optional test names or files, and the flags `--report-only`, `--max N` and `--sidecar <path>`.
With no scope named, it takes the tests added or changed on the branch; when more are in scope than `--max` (default 10) it ranks them and lists the rest as unchecked.

It reads each test for the classic fakes (never runs, never asserts, asserts nothing real, swallows its own failure, async left unawaited), runs each test green and checks the runner's count, then mutates the guarded line and runs only that test.
Each test is classified as killed as predicted, killed for the wrong reason, or survived.
Every mutated file is copied to the scratchpad first and restored with a `cmp` check, never with `git checkout`, `git restore` or `git stash`.
The report has one row per test; without `--report-only` it then fixes the weak tests and re-runs the same mutation against each fix.

With `--sidecar <path>`, each result is also appended to that file as a `mutant` line, which the `/github-pr-review-panel` panel counts while the run is going.

## Known limits

- In a `dontAsk` permission mode, the `jq ... >>` append that writes the `mutant` lines is denied, so the sidecar stays empty.
- A repo with no way to run a single test locally gets Step 1 only.
- `model: opus` and `effort: high` are set in the skill's frontmatter, so a session without that model runs it as the harness resolves it.

## What was checked

Not run live from this plugin: no session has loaded it from fixings and mutated a real test.
`claude plugin validate .` covers its manifest and the skill's frontmatter.
