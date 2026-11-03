# Link preview pane

- Status: Proposed
- Created: 2026-11-03
- Reflects: mod ideas written 09 to 12 Oct 2026, checked against the plugin types then

## Summary
Added 11 Oct 2026.

## Context
A click on a GitHub or Jira link in an assistant reply opens a small pane with a preview of the pull request, issue or card, without opening a browser.
A hover cannot trigger it: `hover` only overrides styles on a tree already drawn ("No hook runs and nothing crosses to the plugin"), so a hover card needs every link fetched ahead of time, and the hover target is a keyed `Box`, not one link inside a paragraph.
A `Markdown` element with `onLinkPress` raises `ui.press` with the link's `href` on a plain single click; a ctrl, alt or cmd click still opens the browser.
Clicks are reported in the fullscreen terminal only.
GitHub first: `github-pr-review` already has the `gh` JSON helper and draws a pull request in a pane, so a clicked link can hand it a PR number.
Jira needs an API token: neither `jira` nor `acli` is installed.
Overlaps with the clickable links proposal, which hooks the same `AssistantMessage` component.
Not checked: whether an `AssistantMessage` hook that returns its own `Markdown` of the reply's text draws the same as the engine's own.

## Design
Not yet written.

## Alternatives considered
Not yet written.

## Consequences & open questions
Not yet written.
