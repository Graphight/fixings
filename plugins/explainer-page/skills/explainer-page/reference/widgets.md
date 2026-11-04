# Widgets

Four patterns that have earned their place, with working implementations in `widgets/`.
All of them depend on the token names and the `.rig` / `.readouts` / `.ro` CSS in `scaffold.html`.

## Choosing one

| The point you're making | Pattern | File |
|---|---|---|
| Things take turns on a shared resource | Rhythm timeline | `widgets/rhythm-timeline.js` |
| A bottleneck forms *here* and not there | Queue simulator | `widgets/queue-simulator.js` |
| You typed X but the system runs X×N | Parameter calculator | `widgets/parameter-calculator.js` |
| The symptom and the cause are in different places | Incident stepper | `widgets/incident-stepper.js` |

Two or three per page. Not one per section.

Leave structural diagrams static — a map of what nests inside what has no behaviour to animate, and making it move adds nothing.
Hand-author those as inline SVG using the `svg .box` / `.wire` / `.fill-*` classes, which are already theme-token driven.

## The bar every widget has to clear

**Drag the control. If nothing surprising happens, cut it.**

The good ones let the reader *discover* the claim instead of reading it:

- Set the tenant count to 1 and the overhead bars vanish — that's the argument for dedicated hardware, made without a sentence.
- Push arrivals past the knee and throughput flatlines while latency climbs — that's queueing theory, felt rather than asserted.
- Nudge a concurrency limit from 2 to 3 and *three* tiles appear — that's the hidden multiplier, and it's undeniable once you've seen it.

## Verify the logic before you publish

A simulation can look completely convincing in motion and be wrong. This has actually happened: the queue simulator originally had a service rate of 0.7/s against a slider defaulting to 6/s, so it was saturated at every setting and its "keeping up" state was unreachable. It animated beautifully. It argued the opposite of its own caption.

Always, in this order:

```bash
# 1. syntax
python3 -c "
import re; s=open('page.html').read()
open('/tmp/c.js','w').write(re.search(r'<script>(.*)</script>', s, re.S).group(1))"
node --check /tmp/c.js

# 2. behaviour — replicate the loop with the same constants and assert the claim
node /tmp/harness.js
```

The harness is throwaway, ten lines, and it answers one question: *does the thing the caption promises actually happen?*

- Queue sim → run 3600 frames at several rates; assert throughput saturates at `permits / service_time` and the queue grows only past that point.
- Rhythm timeline → run 2000 frames; assert each lane fires exactly once per cycle, with no double-fire across the phase wrap.
- Anything with a threshold → check the state actually changes on both sides of it.

Tune the constants until the numbers match the story, then ship.

## Changing an animation's speed without breaking its numbers

Reviewers ask for this constantly — "great widget, 40% slower please".

Scaling only the pixels-per-frame silently changes the physics: in a queue simulator it moves the service rate, so the saturation knee shifts and the readouts start disagreeing with the caption.

Scale the *simulated second* with the motion. Keep a `FPS_SIM` constant (frames per simulated second) and a matching `MS_PER_FRAME`, derive the arrival probability and the throughput window from `FPS_SIM`, and then slowing the pixels by 40% leaves capacity, the knee and the millisecond readouts exactly where they were. Re-run the harness afterwards to prove it.

## Shared conventions

**Readout colours carry meaning.** `.good` → `.warm` → `.hot` as a value crosses a real threshold. Pick thresholds from the subject, not from aesthetics.

**A verdict line under every widget.** One sentence, in `.verdictline`, that changes with the controls and names what the reader is looking at. This is where the teaching happens.

**Label invented numbers**, in a `.rigcap` right under the rig:

> Illustrative model, not a measurement — the shape is right, the constants are invented.

**Respect reduced motion.** Anything animated starts paused when `prefers-reduced-motion: reduce` is set, and the play control still works for people who want it.

**Redraw on theme change.** Canvas reads CSS variables at paint time, so it will not follow a theme toggle by itself:

```js
new MutationObserver(draw).observe(document.documentElement,
  { attributes: true, attributeFilter: ['data-theme'] });
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', draw);
```

**Canvas sizing.** Author at `width="1720"` with CSS `width: 100%`, so it scales down cleanly. Canvas font sizes are in canvas pixels — roughly double what you want on screen.

**A throw inside requestAnimationFrame is permanent.** The loop never reschedules, every control goes dead, and only a page refresh brings it back — so it presents as "the widget froze", not as an error anyone sees.

The usual culprit is a rounded-rect helper: `arcTo` raises `IndexSizeError` on a negative radius, and `r = Math.min(r, w/2, h/2)` goes negative the moment `w` does. Any width computed as `something - padding` will pass through negative while a value eases toward zero, even if its guard looked safe. Clamp inside the helper rather than at each call site:

```js
w = Math.max(0, w); h = Math.max(0, h);
r = Math.max(0, Math.min(r, w / 2, h / 2));
```

Worth testing for directly: run the easing loop headless, max out the inputs, and assert no drawing call ever receives a negative width.

**Never throw on a missing element.** Every widget starts `if (!el) return;` so one absent section can't break the rest of the page.
