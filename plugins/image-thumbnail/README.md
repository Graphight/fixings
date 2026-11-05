# image-thumbnail

`image-thumbnail` shows a small picture of each image you paste into your prompt, in a band above it, so you can check it is the right one before you send.
Install it with `/plugin install image-thumbnail@fixings`.
macOS only.

## What you're looking at

![The band above the prompt with a pasted image's thumbnail, numbered](../../docs/screenshots/image-thumbnail-annotated.jpg)

1. **The pasted image.**
   A thumbnail of the image behind `[Image #1]` in your draft, with its name underneath.

## How it works

Every half second it reads your draft for `[Image #N]` markers.
Claude Code saves each pasted image as a file in its temp folder (`/tmp/claude-<uid>/<project>/<session>/images/<n>.png`, or under `CLAUDE_CODE_TMPDIR` if you set it), and the band draws that file.
A thumbnail is up to eight rows tall, and several images share the band's width side by side.
If the file is not there, the band shows the image's name as text instead.
It never writes or deletes files.

The band stacks with other bands, such as `evidence-band`'s, so both show at once.

## Known limits

- macOS only, because it uses `sips` to read the image size; elsewhere you get the name as text.
- Your terminal needs the kitty graphics protocol, as in Ghostty or kitty; otherwise you get the name as text.
- The thumbnail can take up to half a second to appear.
- If the band is collapsed, press `ctrl+x ctrl+a` to open it.

## What was checked

- `claude plugin test plugins/image-thumbnail` covers one and several images, sizing, a missing file and `CLAUDE_CODE_TMPDIR`.
- Before the port, in October 2026, pasted images were saved as `<n>.png` before the prompt was sent, and stayed there after.
- Live on 2026-11-05 in Ghostty, beside `skins` 0.5.16: an image pasted into an unsent draft showed as in the picture above.
- Not checked: dragging an image file in instead of pasting, and `CLAUDE_CODE_TMPDIR` outside the tests.
