# prove-tests

`prove-tests` is a skill that breaks the code a test guards, one small mutation at a time, and checks the test fails at the assertion and for the reason predicted.
Install it with `/plugin install prove-tests@fixings`.
It has no mod, no hooks and no dependencies; the `github-pr-review` plugin calls it to check the tests a pull request adds.

## The skill

`prove-tests` runs when asked "are these tests real?", "can these tests fail?" or to "prove the tests", and after tests are written in a session (model `opus`, effort `high`).
It takes optional test names or files, and the flags `--report-only`, `--max N` and `--sidecar <path>`.
With no scope named, it takes the tests added or changed on the branch; when more are in scope than `--max` (default 10, set by the `max_tests` option) it ranks them and lists the rest as unchecked.

It reads each test for the classic fakes (never runs, never asserts, asserts nothing real, swallows its own failure, async left unawaited), runs each test green and checks the runner's count, then mutates the guarded line and runs only that test.
Each test is classified as killed as predicted, killed for the wrong reason, or survived.
Every mutated file is copied to the scratchpad first and restored with a `cmp` check, never with `git checkout`, `git restore` or `git stash`.
The report has one row per test; without `--report-only` it then fixes the weak tests and re-runs the same mutation against each fix.

With `--sidecar <path>`, each result is also appended to that file as a `mutant` line, which the `/github-pr-review-panel` panel counts while the run is going.
The line is written by the bundled `scripts/sidecar.bash`, which the skill's `allowed-tools` pre-approves, so it lands in a `dontAsk` session too.

The default is the `max_tests` plugin option; change it in `/plugin` → Configure options, or `/config`.

## Known limits

- A repo with no way to run a single test locally gets Step 1 only.
- `model: opus` and `effort: high` are set in the skill's frontmatter, so a session without that model runs it as the harness resolves it.

## What was checked

All on 4 Nov 2026.
`claude plugin validate .` covers its manifest, the `max_tests` option and the skill's frontmatter.
`scripts/sidecar.bash` fed a test name holding backticks, `$(whoami)` and double quotes wrote it as literal JSON.

One headless run, `claude -p "/prove-tests --report-only --max 1 --sidecar <path> ..." --permission-mode dontAsk`, loaded this plugin with `--plugin-dir` on a scratch copy of `github-pr-review`.
Its allow list covered the test command, `cp`, `cmp`, `git status`, `git diff`, Read, Edit and Write, but not the sidecar script.
It mutated `register.tsx:444` (`===` to `!==`), the test "counts mutants by result under the findings and on the prove tests row" was killed as predicted, and the script call wrote `{"kind":"mutant",...,"result":"killed"}` to the sidecar.
`dontAsk` denied four other Bash calls in the same run, so the mode was in force and the skill's `allowed-tools` line is what let the script through.

Two one-turn headless `/prove-tests` runs, loaded with `--plugin-dir`, show how `max_tests` reaches the skill.
With `max_tests` set to 3 through `--settings` `pluginConfigs`, the skill text read `` (default `3`, ``.
With nothing set, it read the literal `${user_config.max_tests}`, so the declared default of 10 is not substituted and the skill's "or 10 when that is not a number" clause is what supplies it.

Not checked live: a full `/github-pr-review` run that reaches its `prove` step in `dontAsk`.
