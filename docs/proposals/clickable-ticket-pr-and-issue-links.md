# Clickable ticket, PR and issue links

- Status: Proposed
- Created: 2026-11-03
- Reflects: mod ideas written 09 to 12 Oct 2026, checked against the plugin types then

## Summary
A `ui.render` hook on `AssistantMessage` that wraps `PROJ-1234` and `#3` in the engine's `Link` element, which emits an OSC 8 hyperlink.

## Context
The GitHub base URL comes from `$.session.repo`; the Jira base URL needs a `userConfig` option.
Try one `CLAUDE.md` line asking for full markdown links first, and build the mod only if that does not hold.
`AssistantMessage.text` is the block's markdown as the surface's transcript will draw it, with what the terminal hides of a reply already gone (index.d.ts:10458-10461).

## Design
Not yet written.

## Alternatives considered
Not yet written.

## Consequences & open questions
Not yet written.
