# Sub-agent cost pane

- Status: Proposed
- Created: 2026-11-03
- Reflects: mod ideas written 09 to 12 Oct 2026, checked against the plugin types then

## Summary
A pane with one row per sub-agent: type, model, tokens in and out, cache reads, and dollars, with a total and the share of the session's spend.

## Context
Live sessions only; past sessions are out of scope.
Install `flightdeck` first: its `agents` panel already draws each sub-agent's live context, output tokens, steps and clock, and stops short of dollars.
Build this pane only if the dollar column is still missed.
`checkpoint-plan` records each sub-agent's edited `files`, but not its `usage` and `model`: those were dropped from the stage records as unused and can be restored.
`$.session.usage()` returns dollars for the whole session only, so a sub-agent's dollars are its tokens times a price table kept in the mod.
`ccusage session --id <id> --json` (checked 09 Oct 2026) prices a session and includes its sub-agents' responses, but each entry holds only a model, token counts and a timestamp, so it cannot split the total by sub-agent.
A sub-agent's `turn.complete` carries its `agentId` (index.d.ts:14372) and the turn's `usage` with its `model` (index.d.ts:14380, 14743-14748) live, so the split needs no jsonl parsing; sum the turns per `agentId`.

## Design
Not yet written.

## Alternatives considered
Not yet written.

## Consequences & open questions
Not yet written.
