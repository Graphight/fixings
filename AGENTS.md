# AGENTS.md

Guidance for coding agents working in this repository.
Claude Code reads this file natively; there is deliberately no `CLAUDE.md`, because one would stop this file loading.

## Project overview

`fixings` is a Claude Code plugin marketplace: small mods and skills that improve the terminal experience.
The vision, the thesis and the non-goals live in `docs/brief.md`; read it before proposing a plugin.
Contribution rules are in `CONTRIBUTING.md`.

## Where things live

| Path | Job |
| --- | --- |
| `.claude-plugin/marketplace.json` | the marketplace manifest: its name, owner and plugin list |
| `plugins/<name>/` | one installable plugin: a mod, a skill, or a skill with its companion mod |
| `plugins/<name>/.claude-plugin/plugin.json` | the plugin's manifest and version |
| `plugins/<name>/README.md` | the plugin's behaviour, known limits and what was checked in a live session |
| `plugins/<name>/tests/` | the plugin's tests, run by `claude plugin test plugins/<name>` |
| `docs/brief.md` | the vision, the thesis and the non-goals |
| `docs/README.md` | the proposal and decision convention, and its template |
| `docs/proposals/` | ideas not yet acted on |
| `docs/decisions/` | dated records of what was chosen or rejected, and why |
