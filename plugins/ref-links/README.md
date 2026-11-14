# ref-links

`ref-links` turns ticket, PR and issue references in Claude's replies and in the prompts you type into links you can cmd-click.
Install it with `/plugin install ref-links@fixings`.

## What it links

| Written as | Links to |
| --- | --- |
| `#3` | `https://github.com/<owner>/<repo>/issues/3` for the session's repository; GitHub redirects an issue URL to the pull request when `3` is one |
| `owner/repo#3` | `https://github.com/owner/repo/issues/3`, whatever the session's repository is |
| `PROJ-1234` | `<jiraUrl>/browse/PROJ-1234`, only for a project listed in `projects` |
| `https://github.com/owner/repo/pull/3` | the same URL, drawn as `repo#3` |

The session's repository comes from its remote.
`git@github.com:o/r.git`, `https://github.com/o/r` and `ssh://git@github.com/o/r` are read; any other remote, or no repository, leaves a bare `#3` plain.

## Options

Set them in `/config`.

| Option | Default | Meaning |
| --- | --- | --- |
| `jiraUrl` | empty | base URL of your Jira, such as `https://example.atlassian.net` |
| `projects` | empty | comma-separated project keys to link, such as `PROJ,OPS` |

Jira keys link only when both are set, so `UTF-8` and `SHA-256` never link.

## If you use skins or prompt-tint

`ref-links` rewrites a reply before the next mod draws it, and walks a prompt after the next mod has drawn it, so it has to be listed first in `enabledPlugins` to see their output.
`/plugin install` puts it at the end of the list, so after installing, move its line above the `skins` and `prompt-tint` lines in your settings file:

```json
"enabledPlugins": {
  "ref-links@fixings": true,
  "prompt-tint@fixings": true,
  "skins@hellosverre-mods": true
}
```

## What it leaves alone

- Anything inside an inline code span or a fenced block.
- Text already inside a markdown link or an autolink.
- A reference with a word character right before or after it: `abc#3`, `foo.md#3a` and `XPROJ-1` stay plain.
- Notifications and messages from teammates; only prompts you type are linked.
- Tool output and slash-command output.

## Known limits

- A number after `#` outside code links as an issue, so an all-digit colour such as `#000000` written in prose links to issue 0.
- A non-GitHub remote links nothing but `owner/repo#N`, Jira keys and GitHub URLs.
- There is no hover preview of a linked ticket.

## What was checked

- `claude plugin test plugins/ref-links` covers each reference form, the three remote spellings, a non-GitHub remote and no repository, code spans and fences, existing links, the word boundaries, Jira with and without config, and typed, plain and notification prompts.
- Not yet checked in a live session; stage 6 of the build plan adds that.
