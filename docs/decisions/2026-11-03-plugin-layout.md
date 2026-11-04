# Plugin layout

- Status: Accepted
- Created: 2026-11-03
- Reflects: branch `interview`

## Summary
A plugin keeps its skills under `skills/<skill>/SKILL.md` and its companion mod's `hooks/`, `tests/` and `tsconfig.json` beside them, with one manifest per plugin.

## Context
Decision `plugin-packaging` merges a companion mod into the plugin of the skill it serves. The merged plugin needs one fixed shape, so the batches that follow place files the same way.

## Design
- Skills live at `plugins/<name>/skills/<skill>/SKILL.md`.
- A companion mod's `hooks/`, `tests/` and `tsconfig.json` sit at the plugin root, beside `skills/`.
- One `.claude-plugin/plugin.json` per plugin covers the skill and the mod, so they install and version together.

## Alternatives considered
- A separate manifest for the mod inside the same plugin: declined, since the skill and its mod are installed as one.
- Nesting the mod under the skill's directory: declined, since a plugin may carry several skills and the mod belongs to the plugin, not to one of them.

## Consequences & open questions
Later batches follow this layout without a new decision. A plugin with several skills and one mod has no per-skill place for the mod's files.
