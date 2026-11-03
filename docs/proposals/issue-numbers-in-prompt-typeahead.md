# Issue numbers in the prompt's typeahead

- Status: Proposed
- Created: 2026-11-03
- Reflects: mod ideas written 09 to 12 Oct 2026, checked against the plugin types then

## Summary
A `prompt.autocomplete` hook matched on `{ token: /^#/ }` can return suggestion rows (`text`, `label`, `description`), so that typing `#` in the prompt box offers the repository's open issues, each as `#<n>` with its title as the description.

## Context
The rows come from the same `gh issue list` call the `what-next` mod makes.
The hook fires as the person types, for the token at the cursor (index.d.ts:4304-4305), so it runs per token and the `gh` result needs caching.

## Design
Not yet written.

## Alternatives considered
Not yet written.

## Consequences & open questions
Not yet written.
