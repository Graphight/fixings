# What comes across

- Status: Accepted
- Created: 2026-11-03
- Reflects: branch `bootstrap-skeleton`

## Summary
Only mods and skills that work for anyone come into fixings; the rest are dropped or excluded, and work-specific names are scrubbed.

## Context
The source setup mixes general tooling with pieces tied to one workplace and pieces kept personal. fixings is public machinery and must not depend on, or name, an employer.

## Design
- Dropped, because each is tied to one workplace's Slack channel, GitHub organisation or notes repository: share-pr-in-slack, activity-report, summarise-pr.
- Excluded for good, as personal: rule-guards, retro, rename-ticket, card-readiness.
- Jira example keys taken from work projects become `PROJ-1234`.
- No employer name appears anywhere in fixings, including in these decision records.
- Files are copied into a fresh history; the source repository is read-only and its git history is not carried over.
- A mod's root `types/index.d.ts` is tracked; `plugins/*/.claude-plugin/types/` is git-ignored.

## Alternatives considered
- Neutering each dropped skill instead (the channel, organisation or notes path supplied by the user): offered for each, declined.
- Carrying the source history: rejected, it would expose the names the scrub removes.

## Consequences & open questions
A dropped skill can return later as a proposal if it can be made independent of one workplace.
