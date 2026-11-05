# prompt-tint

`prompt-tint` draws your own typed prompts on a `#241a12` background with an orange border, so they read apart from the tool rows.
Install it with `/plugin install prompt-tint@fixings`.

## How it works

A `ui.render` hook on the `UserMessage` component replaces the row with the prompt text inside a bordered, tinted box.
It draws composer, bridge and SDK prompts only, and hands anything else — notifications, teammate messages, a prompt over 4000 characters — back to Claude Code.

## What you're looking at

![A typed prompt in its orange box, numbered](../../docs/screenshots/prompt-tint-annotated.jpg)

1. **Your prompt, tinted.**
   The typed prompt in a box with an orange (`#ff8f40`) border and a `#241a12` background; the rows below it keep their own look.

## Beside skins

The `skins` plugin (hellosverre/claude-skins) draws your prompts too, and its hook does not call `next`, so whichever of the two sits outside the other draws the prompt.
Claude Code nests the hooks in `enabledPlugins` order, the earlier entry outside.
`/plugin install` adds `prompt-tint@fixings` after the entries already there, so move its line above `"skins@hellosverre-mods": true` in the same settings file:

```json
"enabledPlugins": {
  "prompt-tint@fixings": true,
  "skins@hellosverre-mods": true
}
```

Without `skins` there is nothing to move.

## Options

Set these in `/config`; a blank value falls back to the default.

| Option | Default | Colours |
| --- | --- | --- |
| `border` | `#ff8f40` | the box around the prompt |
| `background` | `#241a12` | behind the prompt |
| `text` | `#d8d4cc` | the prompt text |

## Known limits

- Beside `skins`, a prompt draws in the skin's grey whenever `prompt-tint@fixings` sits below `skins@hellosverre-mods` in `enabledPlugins`, and also when it is installed at local scope while `skins` is installed at user scope.

## What was checked

`claude plugin test plugins/prompt-tint` covers a tinted typed prompt, the colours set in `/config` and the prompts handed back.
On 2026-11-05, in a fullscreen session beside `skins` 0.5.16 with the plugin installed from this marketplace (the branch checkout added as a `directory` marketplace):

- installed at local scope, the prompt drew in the skin's grey;
- enabled at user scope and listed above `skins@hellosverre-mods`, it drew in the orange box, which is the picture above;
- enabled at user scope and listed below it, it drew in grey again.
