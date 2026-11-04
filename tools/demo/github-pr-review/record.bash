#!/usr/bin/env bash
# Records the github-pr-review panel filling from a hand-made sidecar, as ./github-pr-review.gif.
# The session runs fill.bash in three phases through the plugin's own sidecar.bash, so the panel shows every step, findings, kept and cut verdicts and a done line without a real review.
# Needs vhs, ttyd, ffmpeg and jq, and claude on the PATH; the run loads the plugin from this checkout and uses the signed-in Claude account.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
work="$(mktemp -d)"
export DEMO_DIR="$work/tide-notes"
export PLUGIN_DIR="$(cd "$here/../../../plugins/github-pr-review" && pwd)"
export SIDECAR="$HOME/.claude/reviews/demo-tide-notes-7.jsonl"
trap 'rm -rf "$work" "$SIDECAR"' EXIT

mkdir -p "$DEMO_DIR"

cat > "$DEMO_DIR/fill.bash" <<FILL
#!/usr/bin/env bash
set -euo pipefail
s="$PLUGIN_DIR/skills/github-pr-review/scripts/sidecar.bash"
f=\$1
case \$2 in
  1)
    bash "\$s" "\$f" init
    bash "\$s" "\$f" pr <<'X'
7
Read the tide table from the station feed
https://github.com/demo/tide-notes/pull/7
4f2a9c1
X
    bash "\$s" "\$f" step fetch; sleep 2
    bash "\$s" "\$f" step analyse; sleep 2
    bash "\$s" "\$f" finding <<'X'
1
BLOCKING
src/tides.ts
42
The station id is interpolated into the URL without encoding
X
    bash "\$s" "\$f" finding <<'X'
2
IMPORTANT
src/tides.ts
88
A failed fetch returns an empty table, which reads as no tide
X
    bash "\$s" "\$f" finding <<'X'
3
NIT
src/format.ts
12
The height helper is named after its unit, not its meaning
X
    ;;
  2)
    bash "\$s" "\$f" step verify; sleep 2
    bash "\$s" "\$f" verdict <<'X'
1
true
Confirmed: an id with a slash reaches another endpoint
X
    bash "\$s" "\$f" verdict <<'X'
2
true
Confirmed: the catch returns [] and callers do not check
X
    bash "\$s" "\$f" step cull; sleep 2
    bash "\$s" "\$f" verdict <<'X'
3
false
Refuted: the name matches the module's other helpers
X
    ;;
  3)
    bash "\$s" "\$f" step report; sleep 2
    bash "\$s" "\$f" done COMMENT
    ;;
esac
FILL

(cd "$work" && vhs "$here/github-pr-review.tape")

# the bottom of the frame is the session's status line (spend and usage), so it is cropped off
ffmpeg -v error -y -i "$work/github-pr-review.mp4" \
    -vf "crop=1200:632:0:0,setpts=PTS/2,fps=8,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=none:diff_mode=rectangle" \
    github-pr-review.gif
echo "wrote $(pwd)/github-pr-review.gif"
