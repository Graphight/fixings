---
name: explainer-page
description: >
  Build a sleek, interactive HTML artifact that explains something — how a part of a codebase
  works, a design, a proposal, a spike's findings, a concept. Use when the user says "build me
  an artifact explaining X", "make a page about X", "visualise how we do X in this repo",
  "explain our X as a page", "write this up as an artifact", or asks for a shareable write-up.
  Produces a single self-contained page in a fixed house style: sticky vertical nav rail,
  auto/light/dark toggle, interactive widgets that carry the argument, and a short quiz at
  the end of each section.
---

# Explainer page

Turn a question into a page someone will actually read and share.
Most often the subject is a codebase, and the research steps below are written for that case; for any other subject, apply the same rules to whatever sources it has.

The output is one self-contained HTML file published as an Artifact.
The house style is fixed and lives in `reference/scaffold.html` — copy it, don't re-derive it.
What changes per job is the research, the palette, and which widgets earn their place.

## The rule that matters most

**Every claim on the page must be traceable to a source you actually read** — a file, a ticket, a doc, a page you fetched.

Not "this is probably how it works". Not what the README asserts.
The most valuable thing this skill produces is usually the moment the code and the docs disagree — surface those loudly, in their own callout, dated.

Do not skip this to get to the design faster. A beautiful page that is wrong is worse than no page.

## Step 1 — Research before designing

Grep and read first. Build a factual spine, then decide what the page says.

Work outward from the user's question:

```
! rg -n "<the mechanism>" --type-add 'cfg:*.{yaml,yml,toml,json}' -tcfg -tpy -tmd
```

Collect, for whatever the subject is:
- The config that is the single source of truth, and the real values per service/module
- The code path end to end — trace it, don't infer it
- The deployment/runtime reality (manifests, env vars, defaults in code)
- Counts and inventories: who uses this, who doesn't, and *why not* — the exceptions teach the most

Specifically hunt for:
- **Docs that contradict code.** A CLAUDE.md or README claiming a setting exists that `rg` cannot find.
- **Defaults that differ from deployed values.** `os.getenv("X", "2")` overridden to `"1"` everywhere in production is a footgun for the next service.
- **The service that breaks the pattern.** There is always one. It is usually the oldest and the biggest, and it is usually missing from the summary table.

Record the date you checked, and put it on the page.

## Step 2 — Palette

If the user supplies a URL or a named scheme, fetch it and use those exact hexes:

```
WebFetch <url> "Extract every hex code: background, foreground, accents, borders, both light and dark variants."
```

Otherwise pick a palette grounded in the subject's own world, and avoid the AI-default looks
(cream + serif + terracotta; near-black + acid green; purple-blue gradient hero).

Map whatever you get onto the token names in the scaffold — do not invent new token names,
the widget CSS depends on them.

## Step 3 — Type

Three roles, always:
- **Display** — headings, the rail, readout numbers. Characterful.
- **Body** — running prose. A serif reads well for long technical writing and separates the page from every other dev doc.
- **Mono** — config, code, labels, eyebrows, all numerals in tables.

Avoid Inter and Space Grotesk as the "safe" pick. Google Fonts is the only permitted host.

## Step 4 — Build from the scaffold

`reference/scaffold.html` is the house style, already correct. It gives you:

- **Vertical sticky nav rail** — numbered sections, active-section highlight via IntersectionObserver, flame progress fill on the right edge, collapses to a horizontal bar under 880px. *This is the signature element. Keep it on every page.*
- **auto / light / dark toggle** — tri-state, persisted to localStorage, sits in the rail foot.
- **Full theming** including `color-scheme` and themed scrollbars.
- **Section rhythm** — generous separation, eyebrow + hairline, big display headings.
- **Instrument surfaces** for widgets, readout grids, callouts, end-of-section quizzes, and improvement cards for when they are asked for.

House rules baked in, keep them:

| Rule | Why |
|---|---|
| **Do not clamp prose to a narrow measure** | The user dislikes a 65ch column. Let body text fill the content column. |
| Generous vertical separation between sections | `--sep: clamp(5rem, 11vh, 9rem)` |
| Every colour defined at `:root`, never only inside a media query | Otherwise the un-stamped "system" state renders one theme's text on the other's ground |
| Wide content scrolls in its own container | The body never scrolls sideways |
| `prefers-reduced-motion` pauses every animation | Simulations start paused when it is set |

## Step 5 — Widgets

See `reference/widgets.md` for working patterns: canvas simulator, parameter calculator, incident stepper.

**A widget must carry a section's argument, or it does not go in.**
Decoration reads as AI-generated. A control that lets the reader *discover* the point beats a paragraph asserting it.

Good test: if the reader drags the slider and nothing surprising happens, cut the widget and keep the prose.

Aim for two or three across a page, not one per section. Leave structural diagrams static — a map of what nests inside what has no behaviour to animate.

### Verify widget logic headlessly before publishing

Non-negotiable, and the reason this section exists:

```
! node --check /tmp/extracted.js
```

Then **simulate the loop** in node with the same constants and assert the behaviour you are claiming.
A queue simulation that saturates at every setting, or a rhythm hit that double-fires across a wrap, looks plausible in motion and is simply wrong.

Extract and run it:

```bash
python3 -c "
import re; s=open('page.html').read()
open('/tmp/c.js','w').write(re.search(r'<script>(.*)</script>', s, re.S).group(1))"
node --check /tmp/c.js
```

Then a standalone harness replicating the loop, checking the claim — capacity, fire rate, evenness, convergence.
Fix the constants until the simulated behaviour matches what the caption promises.

### Label invented numbers

Any simulation with made-up timings says so, near the widget:

> Illustrative model, not a measurement — the shape is right, the constants are invented.

Same for any worked incident: call it a reconstruction of the failure mode, not a transcript.
Never present a fabricated outage as real history.

## Step 6 — Structure the page

Roughly eight or nine sections, each a single idea, numbered in the rail.

A shape that works:

1. **The shape of it** — the nesting, the whole system in one diagram
2. **Why this technology at all** — the plain reason, with the real code that chooses it
3. **The centrepiece** — whatever the user said they most care about. Give it the best widget.
4. **How it is wired** — the real config, annotated
5. **The runtime path** — a request/job traced end to end
6. **The arithmetic** — the numbers that govern whether it stays up
7. **Observability** — what is measured, and what the metrics hide
8. **The inventory** — who uses this, who doesn't, totals
9. **Knobs and footguns** — every dial, what turning it costs, plus the docs-vs-code contradictions

### Potential improvements — only when asked

Leave out any "what I would change" or "potential improvements" section unless the user asks for one.
The page explains how the thing works; opinion on how it should work is a separate request.

When the user does ask, add it as the last section, labelled as opinion, and research outside the repo (`WebSearch`) for current practice:
- Sort by honest cost, cheapest first
- Every item gets a **Buys** and a **Costs** line — an improvement with no stated cost is a sales pitch
- Lead with anything the codebase *already does somewhere* — "adopt the pattern in X" beats "go build Y"
- State the hardware or platform constraint that rules options out, rather than recommending something impossible
- Finish with "if I could only do two things"
- Link every external source

Use cards, not a wide table — three-column tables of prose read as crammed.

### A quiz at the end of every section

Each section ends with one multiple-choice question in the scaffold's `.quiz` block.
Clicking an option locks the question, marks the right answer, and reveals the explanation.

- Test the section's argument, not a detail it mentioned in passing — "which pod sees the failure first?", not "what is the default timeout?".
- Three or four options, one right.
- Make the wrong options the real misreadings: what the README claims, the configured cap read as the typical value, the neighbouring mechanism that sounds right.
- Put the right answer in a different slot each time; a reader who learns "it's always B" stops reading.
- The explanation names the source that settles it, so the quiz obeys the same traceability rule as the prose.
- One question per section; a hero or a pure inventory table can skip it.

Check before publishing that every `.quiz-opts` has exactly one `data-right`.

## Step 7 — Publish

Load `artifact-design` first, then write the file and publish:

- `<title>`: a short, specific noun phrase. A name, not a caption, and not a name-plus-explainer.
- `icon`: one short generic word (`chart`, `map`, `code`), on the first publish only; leave it off a redeploy so the page keeps its icon.
- `description`: one sentence, becomes the gallery subtitle.

Republish the same file path to keep the URL.

## Voice — the part reviewers actually complain about

A first draft reads as AI-written, and engineers reviewing their own system notice immediately.
Three habits cause nearly all of it.

**No personification.**
Systems do not lie, want, refuse, admit, or conspire.
A device plugin *advertises* one GPU as three; it does not "tell a useful lie".
A config value does not "promise" anything.
This is the single most-flagged thing in review — it reads as cute at the expense of being accurate, and it obscures the mechanism it is dressed up as explaining.

| Don't | Do |
|---|---|
| "every one of them is lying" | "each one receives a slice, not a card" |
| "the device plugin tells a useful lie" | "the device plugin advertises one card as three" |
| "each layer lies to the one inside it" | "each layer constrains concurrency further" |
| "pod B did nothing wrong" (repeatedly) | "pod B is where it surfaced, not where it originated" |

**No significance inflation.**
Do not tell the reader that something matters — show it and let them conclude.
Cut "this is the big one", "read that again", "the thing worth carrying around", "the most load-bearing X in the codebase", "and that changes everything".
If a sentence is important, it is important without an usher.

**No conversational throat-clearing.**
Cut "Look —", "So here's the thing", "Now —", "And here's what's wonderful".
In chat that cadence works. On a page someone will re-read and share, it is padding.

Other tells worth a sweep before publishing — grep for them:
`emphatically`, `simply put`, `it's worth noting`, `let's be honest`, `isn't that something`, `the whole point is`, plus any metaphor you have used twice (referee, landmine, hostage, land grab).
One good metaphor earns its place; the same one three times is a tic.

**Headings are short noun phrases.**
The "Something, and something else" two-clause heading is the strongest AI tell on the page, and it also wraps badly.
"One card, advertised as three" beats "The device plugin tells a useful lie, and the GPU keeps a queue".
Use `text-wrap: pretty`, never `balance` — balance packs lines to equal length and breaks mid-phrase, which is what "the title wrapping looks weird" usually means.

Then keep each heading short enough to sit on **one line** in the content column: about 45 characters at `clamp(1.7rem, 3.2vw, 2.45rem)` in a 1000px column.
Do **not** reach for `max-width` on a heading to tidy the wrapping. It looks like the fix and is the opposite: it forces a break and orphans the last word, so a 21-character heading renders with one word stranded on line two.
Measure the headings (`len` of the stripped text) rather than eyeballing them.

## The repo is not the whole system

An explainer written only from the repo will confidently describe gaps that are not gaps.
Infrastructure lives in places the repo cannot see: SRE-managed terraform, cluster policy, admission controllers, platform defaults.

A real example: an earlier draft of one of these pages said "there is no `topologySpreadConstraint` anywhere in the repo, so nothing prevents co-location".
True about the repo, wrong about the system — spreading was managed in terraform by another team.

So:
- Phrase absence as **"not in this repo"**, never "does not exist".
- Before recommending something, ask who owns it. A recommendation that needs another team is a *dependency*, not a task — say so in the Costs line.
- Flag the ones you could not check, and say who could.

## Configured caps are not typical values

`max_batch_messages: 256` is a ceiling. Production may run batches of 10 to 32.
Writing "a batch of up to 256 messages arrives" describes a case that essentially never happens, and everything reasoned from it is off.

Check real values against traffic, logs or a person — and where you cannot, say "capped at N" rather than implying N is normal.
The same applies to any limit, timeout or pool size: state the cap as a cap.

## Expect a correction pass, and treat it as the point

These pages get reviewed by the people who built the thing, and the corrections are the most valuable output of the whole exercise.
When they arrive:
- Fix the claim **and** ask whether the same wrong assumption appears elsewhere.
- When a reviewer supplies knowledge that is not in the repo (why a default is what it is, what a team already tried), put it on the page — that is the part no amount of grepping would have found.
- If a section reads as criticism of another team, rewrite it. "There is no HPA anywhere in the repo" lands as a dig; "autoscaling needs cluster-side support, and there are known blockers to pick up with SRE" is the same fact without the edge.

## Tone of the writing

Plain words, concrete before abstract, short sentences for the hits.
Name the thing in English first and the jargon second — "it's holding the door so the next one can't get in — that's a deadlock".

Say what is true and how confident you are. "I don't know" and "this is opinion" are both fine and both better than a confident guess.
Where you assert something you did not verify, soften it to what you did verify: not "the scheduler co-locates these pods" but "nothing in the repo prevents the scheduler co-locating these pods".
