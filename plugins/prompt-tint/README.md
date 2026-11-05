# prompt-tint

`prompt-tint` draws your own typed prompts on a `#241a12` background with an orange border, so they read apart from the tool rows.
Install it with `/plugin install prompt-tint@fixings`.

## How it works

A `ui.render` hook on the `UserMessage` component replaces the row with the prompt text inside a bordered, tinted box.
It draws composer, bridge and SDK prompts only, and hands anything else — notifications, teammate messages, a prompt over 4000 characters — back to Claude Code.

## What you're looking at

Your typed prompt in a box with an orange (`#ff8f40`) border and a `#241a12` background.
The tool rows below it keep their own look.

## Options

Set these in `/config`; a blank value falls back to the default.

| Option | Default | Colours |
| --- | --- | --- |
| `border` | `#ff8f40` | the box around the prompt |
| `background` | `#241a12` | behind the prompt |
| `text` | `#d8d4cc` | the prompt text |

## Known limits

- With a skin that bordered tool rows in the same grey as prompts, the tint is what tells them apart.

## What was checked

`claude plugin test plugins/prompt-tint` covers a tinted typed prompt and the prompts handed back.
Not yet checked in a session loaded from this marketplace.
