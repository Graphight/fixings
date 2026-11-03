# Local tests

- Status: Accepted
- Created: 2026-11-03
- Reflects: branch `bootstrap-skeleton`

## Summary
Plugin tests run on the contributor's machine with `claude plugin test plugins/<name>`; there is no CI.

## Context
Plugin tests drive the Claude Code CLI, which needs a signed-in install. A hosted runner would need credentials and would spend them on every push.

## Design
- Run `claude plugin test plugins/<name>` for each changed plugin, and check the real exit status rather than a piped log.
- Never run the whole suite unless asked.
- No CI workflow is added.

## Alternatives considered
- A GitHub Actions job running `claude plugin test` for the plugins a PR touches, so each PR shows a check: declined. Whether the CLI runs headless in Actions was not verified, and local runs need no setup.

## Consequences & open questions
Nothing enforces the tests, so review relies on the author stating which plugins were tested. A later decision can add CI once a headless run in Actions is shown to work.
