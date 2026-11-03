# Plugin packaging

- Status: Accepted
- Created: 2026-11-03
- Reflects: branch `bootstrap-skeleton`

## Summary
fixings is a marketplace named `fixings` holding one plugin per skill or mod, installed with `/plugin install <name>@fixings`.

## Context
The mods and skills began as loose files in one personal setup repo. A user of the marketplace should take only what they want, and a skill should not arrive without the mod that serves it.

## Design
- Marketplace name `fixings`; plugins live at `plugins/<name>/`.
- One plugin per skill, so each installs alone.
- `checkpoint-plan` is the one bundle: it carries the checkpoint-plan, execute-stage and ship-plan skills and the `plan-executor` agent, since the three skills and the agent form one workflow and are of little use apart.
- Companion mods merge into the plugin of the skill they serve, named after the skill: interview-rounds into `interview`, plan-progress into `checkpoint-plan`, explainer-checks into `explainer-page`, pr-pane into `github-pr-review`. Code and tests that name the old plugin name are renamed to match.
- Mods with no skill stay standalone: checkout-guard, copy-visible, evidence-band, image-thumbnail, mission-control, prompt-tint, turn-tokens, what-next.
- Standalone skills: prove-tests, review-proposals, write-pr-description, write-proposal.

## Alternatives considered
- Strictly one plugin per skill: declined, execute-stage and ship-plan would each carry their own copy of the plan-executor agent.
- Workflow bundles (planning, PRs, proposals) or a single bundle of every skill: declined in favour of installing skills one at a time.
- Keeping each companion mod as its own plugin: declined, so installing the skill brings its mod.

## Consequences & open questions
Merging companion mods means their code and tests change plugin name, so each merge is checked by running that plugin's tests. Every plugin change bumps its version.
