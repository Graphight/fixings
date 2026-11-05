# checkout-guard

`checkout-guard` keeps one session's `git switch` from sending another session's commits to the wrong branch.
Install it with `/plugin install checkout-guard@fixings`.

Sessions in one checkout share one `HEAD`, so a `git switch` in one session moves the branch under the others, and their commits land on it.
`claude -w` gives a session its own worktree; this mod covers the sessions started without it.

## What it denies

- A `git commit` is denied when `HEAD` is no longer on the branch the session last put it on.
- A `git switch`, `git checkout <branch>` or `gh pr checkout` is denied while another session's entry for the checkout is live.

A command is matched one part at a time, split at `;`, `&`, `|` and newlines, with quoted text emptied first, so a commit message that names `git switch` is not read as a switch.
A sub-agent's command is judged against the sub-agent's own directory unless it names another with `-C`.

## How it knows

Each session writes its branch and a time under `<checkout root>::<session id>` in the mod's store every 30 s, and an entry older than 90 s is treated as gone.
A `/clear` or a resume gives the process a new session id; the timer keeps running and the session's branch carries over to the new entry.

The session's branch is kept by comparing `HEAD` before and after each `Bash` call: `HEAD` that moved while the session's own command ran is taken as the session's move, and `HEAD` that moved between two of its commands is not.
After a move from outside, only a switch that moves `HEAD` again, or one that names the branch `HEAD` is already on, sets the session's branch; `git switch <branch>` is how a move you made on purpose is confirmed.

## What you see

The status line shows the count of the others, as `2 other sessions in this checkout`.
A session that starts in a checkout another live session is using gets a toast, and its first prompt carries a note telling it to call `EnterWorktree` before its first edit or commit, branched from origin's default branch unless you name a base.
The note is given once, only to a new session that joined, and only when `isInteractive`; a resumed session (one with earlier turns), `-p` and SDK runs are not nudged.
A slash command leaves the note for the first typed prompt, since a local command such as `/model` does not reach the model.

## Known limits

- `git checkout <file>` without `--` reads as a switch and is denied while another session is live; `git restore` is not.
- A switch inside a script is not matched by the switch guard; the commit guard catches its effect in the other sessions.
- The session's branch is a module variable, so a hot reload of the mod sets it again from the current branch.
- A `cd` to another repository followed by a commit in one command is judged against the session's directory.
- A `-C` directory that only the shell can resolve, such as `$R` or `~/repo`, is judged against the session's directory.
- A heredoc body is not quoted text, so a line in it that starts a `git switch` is read as a switch.

## What was checked

Before the port, on 09 Oct 2026, with two live `claude -p` sessions in a scratch repository: the second session's `git switch -c probe` was denied and the branch stayed on `main`, and a commit was denied after `HEAD` was moved from outside between the session's two commands.
On 10 Oct 2026, with the first session held for 150 s, a switch from the second at 120 s was still denied, so the 30 s timer runs in a live session and the entry does not go stale.
On 2026-11-05, two `claude -p` sessions loaded this plugin from the checkout with `--plugin-dir plugins/checkout-guard --setting-sources project,local` in a scratch repository; while the first held the checkout with `sleep 60`, the second's `git switch -c probe` was denied with:

```
checkout-guard: 1 other session is in this checkout (on main); a switch would move HEAD under it. Use `git worktree add` or start with `claude -w`; to restore a file use `git restore`.
```

The branch stayed on `main`.
Not checked from a `/plugin install`, and the status-line count and the joining session's note were not looked at.
