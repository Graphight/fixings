# checkout-guard

`checkout-guard` stops two Claude sessions in the same checkout from moving each other's branch.
Install it with `/plugin install checkout-guard@fixings`.

## The problem

Sessions in one folder share one git branch.
If one session runs `git switch`, every other session in that folder is now on the new branch, and its next commit lands there.
`claude -w` avoids this by giving each session its own worktree; `checkout-guard` covers sessions started without it.

## What it blocks

- **A branch switch while another session is here.**
  `git switch`, `git checkout <branch>` and `gh pr checkout` are blocked while another live session shares the checkout.
  Claude sees:

  ```
  checkout-guard: 1 other session is in this checkout (on main); a switch would move HEAD under it. Use `git worktree add` or start with `claude -w`; to restore a file use `git restore`.
  ```

- **A commit after the branch moved underneath.**
  `git commit` is blocked when the branch changed between the session's commands, because something outside the session moved it.
  If you moved it on purpose, `git switch <that branch>` tells the session to carry on there.

## What you see

- The status line counts the other sessions, as `2 other sessions in this checkout`.
- A new session that starts in a busy checkout shows a toast, and Claude is told to move into its own worktree before its first edit or commit.
  This happens once per session, in interactive sessions only, and not when you resume one.

## How it knows

Each session notes its folder and branch every 30 seconds, and a note older than 90 seconds counts as gone.
It compares the branch before and after each shell command: a change during the session's own command is the session's, and a change between its commands came from outside.
Text in quotes is ignored, so a commit message that mentions `git switch` is fine.
A subagent's command is checked against the subagent's own folder, unless the command names another with `-C`.

## Known limits

- `git checkout <file>` without `--` looks like a branch switch, so it is blocked while another session is live; use `git restore <file>`.
- A `git switch` inside a script is not caught, though the commit check still protects the other sessions.
- Reloading the plugin resets the session's branch to whatever is checked out at that moment.
- `cd other-repo && git commit` in one command is checked against the session's own folder, not `other-repo`.
- So is `git -C "$DIR"` when only the shell knows what `$DIR` is.
- A heredoc line that starts with `git switch` is treated as a switch.

## What was checked

- `claude plugin test plugins/checkout-guard` covers both blocks, stale sessions, quoted text, subagents, the status line and the new-session note.
- Before the port, in October 2026, two `claude -p` sessions in a scratch repo: a switch from the second was blocked and the branch stayed on `main`, a commit was blocked after the branch was moved from outside, and a session held for 150 seconds still counted as live.
- On 2026-11-05, the same setup with the plugin loaded from this repo by `--plugin-dir`: the second session's `git switch -c probe` was blocked with the message above, and the branch stayed on `main`.
- Not checked: an install by `/plugin install`, the status-line count and the new-session note.
