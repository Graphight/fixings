---
name: prove-tests
description: Prove that tests are real by breaking the code they guard and watching them fail for the right reason. Use when the user says "are these tests real?", "verify the tests actually test something", "can these tests fail?", "prove the tests", "mutation-check the tests", or after writing tests in a session. Takes optional test names or files.
argument-hint: "[tests or files] [--report-only] [--max N] [--sidecar path]"
model: opus
effort: high
---

# Prove Tests

A green test proves nothing until you have seen it go red.
A test that cannot fail is worse than no test, because it reads as coverage.
The job is to break the code each test claims to guard, one small break at a time, and check that the test fails, at the assertion you predicted, for the reason you predicted.

## Step 0: Scope

- If the user named tests or files, those are the scope.
- Otherwise, take the tests added or changed on this branch: `git diff --name-only $(git merge-base HEAD origin/HEAD)` plus uncommitted changes, filtered to test files (if `origin/HEAD` is unset in this clone, run `git remote set-head origin -a`), then the individual test cases within them that were added or changed.
- If more tests are in scope than `--max` (default 10), rank them and take the top N: tests guarding new production logic first, then tests that lean on mocks or stubs, then tests whose name claims a behaviour that is hard to see in the body.
  List the rest as unchecked in the report; never sample silently.

If `--sidecar <path>` was passed, each result is also appended to that file (see Step 3); without it, no file is written.

Find the command that runs a single test in this repo (from the build file, README, CLAUDE.md, or CI config) before going further.
If no test can be run locally, do Step 1 only and say so plainly in the report.

## Step 1: Read each test for the classic fakes

Read each test and the production code it exercises.
Flag any of these on sight:

- **Never runs** — disabled or skipped, a name or location the runner's pattern does not match, a missing annotation, or a focused `.only` elsewhere in the file starving it.
- **Never asserts** — no assertion at all, an assertion after an early `return`, or an assertion inside a callback, listener, or `forEach` over a collection that is empty.
- **Asserts nothing real** — checks a mock's stubbed return value back at itself, compares a value to itself, or computes the expected value by calling the code under test.
- **Swallows its own failure** — a `try`/`catch` that catches the assertion error, or an expected-exception test that also passes when nothing is thrown.
- **Async left unawaited** — a promise, future, or coroutine whose assertion lands after the test has already passed.

## Step 2: Run it green, and see that it ran

Run each test in scope once, unmodified.
Confirm from the runner's output that the test executed by name and passed.
An exit code of 0 with "0 tests run" or a filter that matched nothing is the classic false green; check the count, not just the exit status.

## Step 3: Break the code, one mutation at a time

For each test:

1. Pick the one line of production code the test exists to guard.
2. Write down a prediction before you touch anything: which assertion fails, and roughly what the failure message says.
3. Make the smallest plausible break that still compiles: flip a condition, return a wrong constant, drop a call, shift a boundary by one.
   A compile error or a crash in setup does not count as the test catching anything; pick a different mutation.
4. Run only that test.
5. Restore the file (see Safety) before the next mutation.

Classify the result:

- **Killed as predicted** — failed at the predicted assertion. The test is real.
- **Killed for the wrong reason** — failed, but somewhere else (setup, an unrelated assertion, a timeout). The test is real by accident; say what it actually checks.
- **Survived** — still green with the code broken. The test does not guard what its name says.

If `--sidecar` was passed, append one line for the test as soon as it is classified and its file is restored, not batched at the end, because the `/github-pr-review-panel` panel counts them while the run is still going.
`result` is `killed` for "killed as predicted", `wrong-reason` for "killed for the wrong reason", and `survived` for "survived".
Shell variables do not survive from one Bash call to the next, and the pane finds the file by the path in the call itself, so write the path that `--sidecar` gave out in full on the same call as the append.
The test name goes in a quoted heredoc, `<<'EOF'`, and never inside a double-quoted argument, where the shell runs backticks and `$(...)`:

```
SIDECAR=<the path --sidecar gave>
jq -Rnc '[inputs] as [$test,$result] | {kind:"mutant",test:$test,result:$result}' >> "$SIDECAR" <<'EOF'
<test name>
<killed|wrong-reason|survived>
EOF
```

A failed append never stops the run.

## Safety

The working tree may hold uncommitted work, so never revert a mutation with `git checkout`, `git restore`, or `git stash`; any of those can wipe the user's edits.

- Before mutating a file, copy it to the scratchpad.
- After the run, copy it back and confirm with `cmp` that it is byte-identical to the backup.
- Only one mutation is live at any moment.
- At the end, check that `git status` and `git diff` match what they showed before Step 3.

## Step 4: Report

One row per test:

| Test | Runs | Mutation | Predicted failure | Result |
|------|------|----------|-------------------|--------|

Then, for every test that is not "killed as predicted", one line on what is wrong and the concrete fix (the missing assertion, the real expected value, the await).
List any unchecked tests from Step 0 by name.

If `--report-only` was passed, stop here.
Otherwise, fix the broken tests, then re-run the same mutation against each fix to prove it now fails, and report the before and after.
That re-run appends no second line to the sidecar.
