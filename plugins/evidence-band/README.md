# evidence-band

`evidence-band` shows the last test or build command Claude ran, and whether it passed, in a band above the prompt.
When Claude says the tests pass, you can see the run behind it.
Install it with `/plugin install evidence-band@fixings`.

## What you're looking at

![The band above the prompt with the last run, numbered](../../docs/screenshots/evidence-band-annotated.jpg)

1. **The last run and its result.**
   Here it reads `? exit 0, maybe a later command's`.
   Claude ran `python3 -m unittest; echo "EXIT: $?"`, so the `0` belongs to the `echo`, not to the tests.

## What the band says

| Band | Meaning |
| --- | --- |
| `✓ exit 0` | the command passed |
| `✗ exit 2` | the command failed, with that exit code |
| `? exit 0, maybe a later command's` | something ran after the command (`;`, a pipe, `\|\|`, `&` or a new line), so the exit code may not be its own; `set -o pipefail` fixes the pipe case |
| `? no exit status` | the run went to the background, was interrupted or timed out, or Claude Code did not count a non-zero exit as a failure |

## Which commands count

Common test and build runners, such as `npm test`, `pytest`, `go test`, `cargo build`, `make`, `./gradlew`, `claude plugin test` and a `test_*` script.
The full list is `RUNNER` in `hooks/register.tsx`.
Text inside quotes does not count, so a commit message that mentions `npm test` is not a run.

The band stacks with other bands, such as `image-thumbnail`'s, so both show at once.

## Known limits

- A runner that is not on the list is not recorded, and the band keeps showing the previous run.
  A passing `pytest` followed by a failing `uv run pytest` still shows `✓ exit 0 · pytest`.
- A runner inside quotes, as in `bash -c "npm test"`, is not recorded.
- A line inside a heredoc that starts with a runner is recorded as a run.
- Runs by subagents are not shown.
- The band does not notice edits made after the run, so a pass can be older than the code.

## What was checked

- `claude plugin test plugins/evidence-band` covers passes, failures, chained and backgrounded runs, and subagent runs.
- Before the port, in October 2026, a failed command's exit code was read from its error text (`Exit code 7`), and the band drew `✓ exit 0` in a live session.
- Live on 2026-11-05, beside `skins` 0.5.16: the band drew the run in the picture above.
