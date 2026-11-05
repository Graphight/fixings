#!/usr/bin/env bash
# Records the /next pane listing a throwaway project's proposals and issues, as ./what-next.gif.
# A stub gh on the PATH serves the issues, so the issues tab is the same on every run.
# Needs vhs, ttyd and ffmpeg, and claude on the PATH; the run loads the plugin from this checkout and uses the signed-in Claude account.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
work="$(mktemp -d)"
export DEMO_DIR="$work/tide-notes"
export STUB_DIR="$work/bin"
export PLUGIN_DIR="$(cd "$here/../../../plugins/what-next" && pwd)"
trap 'rm -rf "$work"' EXIT

mkdir -p "$DEMO_DIR/docs/proposals" "$STUB_DIR"

cat > "$STUB_DIR/gh" <<'GH'
#!/usr/bin/env bash
case "$*" in
  *--assignee*) echo '[{"number":3}]' ;;
  *) echo '[{"number":3,"title":"Tides drift an hour after the clocks change","body":"The table keeps the old offset until the next fetch."},{"number":5,"title":"Show the moon phase beside each tide","body":"Spring tides follow the new and full moon."}]' ;;
esac
GH
chmod +x "$STUB_DIR/gh"

cat > "$DEMO_DIR/docs/proposals/README.md" <<'X'
# Proposals

What is open, in build order.

1. [Read the tide table from the station feed](station-feed.md): can the table come from the station's feed instead of a file? It is the base the others stand on.
2. [Evening tides](evening-tides.md): can the table show the second high and low of the day? It follows the feed.
3. [Tide heights](tide-heights.md): can each line carry a height in metres? It follows the feed.

## Parked

4. [Wave forecast](wave-forecast.md): can the table show swell? No feed offers it yet, so it waits.
X

for slug in station-feed evening-tides tide-heights wave-forecast; do
    printf '# %s\n\nStatus: Proposed\n\n## Problem\n\nThe table is typed in by hand.\n\n## Proposal\n\nRead it from the station feed.\n' "$slug" > "$DEMO_DIR/docs/proposals/$slug.md"
done

(cd "$work" && vhs "$here/what-next.tape")

# the bottom of the frame is the session's status line (spend and usage), so it is cropped off
ffmpeg -v error -y -i "$work/what-next.mp4" \
    -vf "crop=1200:632:0:0,setpts=PTS/2,fps=8,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=none:diff_mode=rectangle" \
    what-next.gif
echo "wrote $(pwd)/what-next.gif"
