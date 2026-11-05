# copy-visible

`copy-visible` draws every block of a reply that has a Copy button in a blue frame on a dark blue background, with the button in bold blue as the first row inside the frame.
Install it with `/plugin install copy-visible@fixings`.

It needs the `skins` plugin (hellosverre/claude-skins), which gives each fenced block, table and diagram in a reply a button that copies that block alone, with no frame characters.
The skin draws the button dim, in a Box placed `position: "absolute"`, `top: -1`, `right: 1`, which is meant to sit on the right end of the frame's top border.
This mod's `ui.render` hook has to sit outside the skin's, because the skin's does not call `next`; see [Beside skins](#beside-skins).

The blue pair, `#7fb0d0` on `#141d26`, is the cool counterpart of `prompt-tint`'s orange, so a block to copy reads apart from a typed prompt.

## How it works

A `ui.render` hook on `AssistantMessage` calls `next(e)` and walks the tree the skin returned.
A `Button` whose key starts with `copy-`, other than `copy-reply`, loses `dimColor` and gets its label as a bold blue `Text`.
The absolute Box that holds such a button loses `position`, `top` and `right` and becomes the first child of its frame, so the button is laid out in the flow.
That frame gets the blue `borderColor` and the dark `backgroundColor`, and every `Text` in it that has no background of its own gets the same background.
A Box that holds a `Markdown` of one whole fence and a copy button is the unframed case: the mod replaces it with a frame of its own, the button first and then one plain `Text` for each line of the fence, with a tab drawn as two spaces.
The button's `press` stamp is passed through unchanged, so a press runs the skin's own closure and copies what the skin would have copied.
The `copy reply` button under a reply is a different control: it copies the whole reply, and is left alone.

## What you're looking at

![A reply with a python fence and an untagged fence, two parts numbered](../../docs/screenshots/copy-visible-annotated.jpg)

1. **Copy on the skin's frame, in blue.**
   A fence the skin knows the language of (here `python`) keeps the skin's frame with `skins` 0.5.16; only its Copy button turns bold blue.
   See [Known limits](#known-limits).
2. **Untagged fence: framed, Copy first.**
   A fence with no tag, or a tag such as `text` or `gdscript`, reaches the mod unframed, and the mod builds a blue frame on a dark blue background with the Copy button as its first row.

## Beside skins

Claude Code nests the two plugins' hooks in `enabledPlugins` order, the earlier entry outside.
`/plugin install` adds `copy-visible@fixings` after the entries already there, which puts it inside the skin, where it draws nothing; move its line above `"skins@hellosverre-mods": true` in the same settings file:

```json
"enabledPlugins": {
  "copy-visible@fixings": true,
  "skins@hellosverre-mods": true
}
```

## Options

Set these in `/config`; a blank value falls back to the default.

| Option | Default | Colours |
| --- | --- | --- |
| `border` | `#7fb0d0` | the frame and the Copy button |
| `background` | `#141d26` | behind the framed block |

## Known limits

- Requires `skins`, listed below this plugin in `enabledPlugins`; a local-scope install beside a user-scope `skins` draws nothing.
- The mod matches the key names and the overlay shape of `skins` 0.5.0. With 0.5.16 a tagged fence's button is still found and turned blue, but it stays on the frame's top border and the frame keeps the skin's colours; the cause has not been looked into.
- Replies only: the Copy buttons on slash-command output and on shell output cards are left as the skin draws them.
- A mouse selection dragged over a frame includes the word `Copy`.
- A frame the mod builds itself has no syntax colours and no fold: a long block is drawn whole, as Claude Code's own drawing drew it.
- A table's frame is tinted too, and its rows that carry the skin's own background keep it.
- A click reaches a button in the fullscreen terminal only.

## What was checked

`claude plugin test plugins/copy-visible` covers the frame, the button restyling, the colours set in `/config` and the frame built for an untagged fence.
On 2026-11-05, in a fullscreen Ghostty session beside `skins` 0.5.16, installed from this marketplace (the branch checkout added as a `directory` marketplace):

- installed at local scope, both fences drew exactly as the skin draws them;
- enabled at user scope and listed above `skins@hellosverre-mods`, the untagged fence drew in the blue frame with Copy as its first row, and the `python` fence kept the skin's frame with a blue Copy on its border, which is the picture above.

Not checked: a click on the button in this session, a table's frame, a `diff` fence and a diagram.
