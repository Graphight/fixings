# fixings

A collection of small machinery that improves the Claude Code terminal experience: mods that reshape the interface, and skills that carry a workflow. Each is its own plugin, so you install only what you want.

## Install

Add the marketplace once:

```
/plugin marketplace add Graphight/fixings
```

Then install any plugin from it:

```
/plugin install <name>@fixings
```

## Plugins

| Plugin | Kind | What it does |
| --- | --- | --- |
| [mission-control](plugins/mission-control/README.md) | mod | lists the other Claude Code sessions in the `/mission-control` side pane |
| [interview](plugins/interview/README.md) | skill + mod | interviews you in rounds before planning, with a round row above each question |
| [checkpoint-plan](plugins/checkpoint-plan/README.md) | skills + mod | stages work into a checkpointed plan, runs it stage by stage or unattended, and draws progress in the `/plan-timeline` side pane |
| [explainer-page](plugins/explainer-page/README.md) | skill + mod | builds an interactive HTML explainer page in a fixed house style, and draws its pre-publish checks in the `/explainer-page-checks` side pane |
| [github-pr-review](plugins/github-pr-review/README.md) | skill + mod | reviews a GitHub pull request into a structured, line-referenced report, and draws its progress in the `/github-pr-review-panel` side panel |
| [what-next](plugins/what-next/README.md) | mod | lists a project's proposals and open issues in the `/next` pane, and starts a session on one |
| [review-proposals](plugins/review-proposals/README.md) | skill | reviews every open proposal in `docs/proposals/` together for conflicts, overlaps, order, size and drift |
