# Proposals

What is open, in build order.

1. [Link preview pane](link-preview-pane.md): can a click on a GitHub or Jira link open a pane with a preview of it? Overlaps with decision `ref-links`, which hooks the same component, so it builds on it.
2. [Issue numbers in the prompt's typeahead](issue-numbers-in-prompt-typeahead.md): can typing `#` offer the repository's open issues? It stands on the `gh issue list` call `what-next` already makes.
3. [Sub-agent cost pane](sub-agent-cost-pane.md): what did each sub-agent cost, in dollars? Last, because `flightdeck` may already be enough; build it only if the dollar column is still missed.

## Parked

4. [Enlarge a pasted image on hover](enlarge-a-pasted-image-on-hover.md): can resting the pointer on an `[Image #N]` show the picture at a readable size? Tried a couple of times and failed, so it waits for a way to make a hover fire on a transcript row.
