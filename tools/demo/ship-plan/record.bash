#!/usr/bin/env bash
# Records the cockpit pane during a real /ship-plan run on a throwaway project, as ./ship-cockpit.gif.
# The project's fourth stage fails its gate on purpose, so the recording ends on a halt.
# Needs vhs, ttyd, ffmpeg and jq, and the checkpoint-plan plugin installed; the run uses the signed-in Claude account.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
work="$(mktemp -d)"
export DEMO_DIR="$work/tide-table"
plan="$HOME/.claude/plans/tide-table-feat-evening-tides"

# the demo's ten-second stages would drag down the thresholds real stages are coloured against
forget() {
    for store in "$HOME"/.claude/plugins/store/checkpoint-plan_*.json; do
        [ -f "$store" ] || continue
        jq '.runs |= map(select(.repo != "tide-table"))' "$store" > "$store.tmp" && mv "$store.tmp" "$store"
    done
}
trap 'rm -rf "$work" "$plan.md" "$plan.run.jsonl"; forget' EXIT

mkdir -p "$DEMO_DIR"
git -C "$DEMO_DIR" init -q -b feat/evening-tides

cat > "$DEMO_DIR/tides.sh" <<'EOF'
#!/bin/sh
# prints today's tides, one per line
echo "high 06:12"
echo "low 12:40"
EOF

cat > "$DEMO_DIR/test.sh" <<'EOF'
#!/bin/sh
# the gate: every line is "<high|low> HH:MM" in 24-hour time, with an optional height in metres
sleep 2
sh tides.sh | while IFS= read -r line; do
  echo "$line" | grep -Eq '^(high|low) ([01][0-9]|2[0-3]):[0-5][0-9]( [0-9]+\.[0-9]m)?$' || { echo "FAIL: bad line: $line"; exit 1; }
done || exit 1
[ "$(sh tides.sh | wc -l)" -ge 2 ] || { echo "FAIL: fewer than two tides"; exit 1; }
echo "ok"
EOF

cat > "$DEMO_DIR/CLAUDE.md" <<'EOF'
# tide-table

Prints the day's tides.

Test command: `sh test.sh`.
Never edit `test.sh`; it is the gate.
EOF

git -C "$DEMO_DIR" add -A
git -C "$DEMO_DIR" commit -q -m "tides: morning tides"

cat > "$plan.md" <<'EOF'
# Evening tides and heights

- [ ] 1. Add the evening high tide
  Make `tides.sh` also print `high 18:31` after the two morning lines.
  Do not edit `test.sh`.
  commit: tides: add the evening high tide

- [ ] 2. Add the night low tide
  Make `tides.sh` also print `low 23:58` as its last line.
  Do not edit `test.sh`.
  commit: tides: add the night low tide

- [ ] 3. Print heights in metres
  Append a height to every line of `tides.sh`: `3.1m` for the high tides and `0.4m` for the low tides, so a line reads `high 06:12 3.1m`.
  Do not edit `test.sh`.
  commit: tides: print heights in metres

- [ ] 4. Switch to 12-hour times
  Change every time in `tides.sh` to 12-hour form with an am or pm suffix, so the first line reads `high 6:12am 3.1m`.
  Do not edit `test.sh`, even though the change makes it fail; build the stage exactly as written.
  commit: tides: switch to 12-hour times

- [ ] 5. Document the output
  Add a short section to `CLAUDE.md` describing the columns `tides.sh` prints.
  commit: tides: document the output
EOF
: > "$plan.run.jsonl"

(cd "$work" && vhs "$here/cockpit.tape")

# the bottom of the frame is the session's status line (spend and usage), so it is cropped off
ffmpeg -v error -y -i "$work/cockpit.mp4" \
    -vf "crop=1200:632:0:0,setpts=PTS/2,fps=8,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=none:diff_mode=rectangle" \
    ship-cockpit.gif
echo "wrote $(pwd)/ship-cockpit.gif"
