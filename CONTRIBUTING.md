# Contributing

## Branches and PRs

**Never commit directly to `main`.**
Branch, push, open a PR, squash-merge.
That holds even for a one-line docs fix and even when working alone: every change gets a diff someone can read after the fact, and `main` stays a list of merged units rather than a stream of keystrokes.

```sh
git checkout -b <short-topic-name>
# ... work, in small cherry-pickable commits ...
claude plugin test plugins/<name>
git push -u origin HEAD
gh pr create
```

Commit subjects are one line and follow [Conventional Commits](https://www.conventionalcommits.org): `type: subject`.

```
feat:     a new plugin, or new behaviour in one
fix:      a defect in shipped behaviour
docs:     decisions, proposals, READMEs, anything under docs/ or a *.md
chore:    layout, manifests, tooling, config; no behaviour change
refactor: same behaviour, different shape
test:     tests only
```

No other prefix, ever.

A PR title follows the same convention, because the squash-merge makes it the commit subject on `main`: `feat: add the what-next mod`, not `Add what-next`.
Pick the type for what the PR does as a whole.

No agent attribution either, in commits or PR descriptions: no `Co-Authored-By` trailer, no "Generated with" footer, no session IDs or links.

## Tests

Tests run locally only; there is no CI.
Run the tests of each plugin you changed, and only those:

```sh
claude plugin test plugins/<name>
```

Check the real exit status: a piped log can look reassuring and still exit non-zero.
Do not run the whole suite unless asked.

## Versions

Every change to a plugin bumps `version` in its `.claude-plugin/plugin.json`, so installed copies update.
A fix bumps the patch, new behaviour the minor.

## Adding a plugin

- [ ] `plugins/<name>/.claude-plugin/plugin.json` with `name`, `version`, `description` and `author`
- [ ] the plugin's `README.md`: behaviour, known limits, what was checked in a live session
- [ ] tests under `plugins/<name>/tests/`, passing under `claude plugin test plugins/<name>`
- [ ] an entry in `.claude-plugin/marketplace.json` and a row in the README's plugin table
- [ ] `claude plugin validate /path/to/fixings` exits 0
- [ ] a mod's root `types/index.d.ts` is tracked; `plugins/*/.claude-plugin/types/` is git-ignored

A skill belongs in its own plugin, and a companion mod merges into the plugin of the skill it serves.

## Design docs

Design history lives in `docs/`: `docs/proposals/` for ideas not yet acted on, `docs/decisions/` for what was chosen or rejected.
Read the relevant decisions before changing anything a plugin's packaging or scope depends on.
An Accepted decision's body is not rewritten; a PR that changes a substantive choice adds a new decision and marks the old one's header.
The full convention and template are in `docs/README.md`.

## Conventions

- No employer or workplace names anywhere in the repo, including decision records; example ticket keys are `PROJ-1234`.
- No unrequested comments; a comment earns its place by saying what a reader needs at that line.
- Files are copied from elsewhere, never with their git history.
- Images are JPEG and live in `docs/screenshots/`; an annotation is white text with a black outline.
