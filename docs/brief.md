# Brief

The vision for fixings, and what decides whether a plugin is in scope.
Proposals work inside it; changing it takes a decision.

## Pitch

fixings is a Claude Code plugin marketplace of small machinery that improves the terminal experience.
Mods change how the terminal looks and behaves: panes, bands, footers and guards.
Skills change how work gets done: planning, reviewing, proving tests.
Each installs on its own, with `/plugin install <name>@fixings`.

## The thesis

**Small, separate and checked.**

Each plugin does one job and installs alone, so a user takes only what they want.
A skill and the mod that serves it ship together, since one is of little use without the other.
Every plugin states its known limits and what was checked in a live session, and carries tests that fail for the right reason.

## Non-goals

- No bundle that installs everything at once.
- No CI; tests run locally, per changed plugin.
- No plugin that depends on one employer's tools, channels or repositories.
- No game content, studies or screenshots archive.
- No plugin that edits a user's settings, `CLAUDE.md` or permissions as a side effect.
