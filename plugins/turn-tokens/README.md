# turn-tokens

`turn-tokens` puts the turn's token counts back on the turn footer, in the form `1.2k in · 340 out · 98.0k cached`.
Install it with `/plugin install turn-tokens@fixings`.

It needs the `skins` plugin (hellosverre/claude-skins).
The skin draws its own footer — word, duration, tool count, lines changed — and leaves out the tokens Claude Code's own footer carried.
Its `ui.render` hook for the footer does not call `next`, so this mod's hook only runs when it sits above the skin's.

## How it works

A `turn.complete` hook records each turn's usage, keyed by the duration the footer is drawn with, and keeps the last 20 turns.
A `ui.render` hook on the `TurnDuration` component takes whatever footer was drawn and appends the counts for that duration, in a muted colour.
A turn run by a subagent, or one with no usage, adds nothing.

## What you're looking at

The turn footer, with the counts after the skin's own parts: input tokens, output tokens, and cached tokens read.
The cached count is left out when it is zero.

## Known limits

- Requires `skins`; without it the footer is Claude Code's own, which already shows tokens, and the counts appear twice.
- Footers are matched by duration in milliseconds, so two turns of the same duration share the later turn's counts.

## What was checked

`claude plugin test plugins/turn-tokens` covers the count formatting and the appended footer.
Not yet checked in a session loaded from this marketplace against `skins` 0.5.16.
