# Enlarge a pasted image on hover

- Status: Proposed
- Created: 2026-11-03
- Reflects: mod ideas written 09 to 12 Oct 2026, checked against the plugin types then

## Summary
Added 12 Oct 2026.

## Context
Resting the pointer on a sent message that holds `[Image #N]` shows the picture at a readable size, over the rows beneath it.
The plugin types document the pattern: a keyed `Box`, and inside it a `Box` drawn `position: "absolute"` and `display: "none"` with `hover: { display: "flex" }`, clipped by the viewport when its site is a transcript row.
The picture is the file `image-thumbnail` already finds, and it stays in the cache after the prompt is sent; the stored message also carries `imagePasteIds`.
A spike on 12 Oct 2026 hooked `ui.render` on `UserMessage`, wrapped `next(e)` and added a line that needs no hover: the line was never drawn.
The likely cause, read from the code and not proven: `prompt-tint` draws typed prompts and returns its tree without calling `next`, and the spike's hook was nested beneath it.
So the hook has to sit above `prompt-tint` in `CLAUDE_CODE_PLUGIN_DIRS`, or `prompt-tint` has to draw the card itself.
Not checked: whether a hover fires on a transcript row, and whether an `Image` inside a revealed `Box` draws its pixels.
Fallback if hover does not work: a click on the row opens a pane with the picture, since `onPress` runs a hook in the fullscreen terminal.

## Design
Not yet written.

## Alternatives considered
Not yet written.

## Consequences & open questions
Not yet written.
