# copy-visible

`copy-visible` draws every block of a reply that has a Copy button in a blue frame on a dark blue background, with the button in bold blue as the first row inside the frame.
Install it with `/plugin install copy-visible@fixings`.

It needs the `skins` plugin (hellosverre/claude-skins), which gives each fenced block, table and diagram in a reply a button that copies that block alone, with no frame characters.
The skin draws the button dim, in a Box placed `position: "absolute"`, `top: -1`, `right: 1`, which is meant to sit on the right end of the frame's top border.
This mod's `ui.render` hook has to run above the skin's, or `next(e)` returns Claude Code's own drawing, which has no such buttons.

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

A reply's fenced blocks, tables and diagrams in a blue frame, each with a bold blue Copy button as its first row.
The skin frames a fence only when it knows the fence's language; a fence with no tag, or with a tag such as `text` or `gdscript`, reaches the mod unframed, and the mod builds the frame itself.

## Options

Set these in `/config`; a blank value falls back to the default.

| Option | Default | Colours |
| --- | --- | --- |
| `border` | `#7fb0d0` | the frame and the Copy button |
| `background` | `#141d26` | behind the framed block |

## Known limits

- Requires `skins`. The mod matches the key names and the overlay shape of `skins` 0.5.x; after a skin release that changes either, the buttons draw as the skin draws them.
- Replies only: the Copy buttons on slash-command output and on shell output cards are left as the skin draws them.
- A mouse selection dragged over a frame includes the word `Copy`.
- A frame the mod builds itself has no syntax colours and no fold: a long block is drawn whole, as Claude Code's own drawing drew it.
- A table's frame is tinted too, and its rows that carry the skin's own background keep it.
- A click reaches a button in the fullscreen terminal only.

## What was checked

`claude plugin test plugins/copy-visible` covers the frame, the button restyling and the frame built for an untagged fence.
Earlier, with the mod hot-reloaded in Ghostty, the button drew in blue as the first row inside a `markdown` frame and a click copied the block alone.
Not yet checked in a session loaded from this marketplace against `skins` 0.5.16, which decides whether the hook runs above the skin's.
Also not checked: a table's frame, a `diff` fence and a diagram.
