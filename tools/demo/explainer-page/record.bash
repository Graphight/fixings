#!/usr/bin/env bash
# Records the checks pane filling after one Edit to a draft page on a throwaway project, as ./explainer-page-checks.gif.
# The draft is the skill's scaffold with known faults, so the pane shows a pass, a warning, a failure and a pending row at once.
# Needs vhs, ttyd, ffmpeg and python3, and claude on the PATH; the run loads the plugin from this checkout and uses the signed-in Claude account.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
scaffold="$here/../../../plugins/explainer-page/skills/explainer-page/reference/scaffold.html"
work="$(mktemp -d)"
export DEMO_DIR="$work/tide-notes"
export PLUGIN_DIR="$(cd "$here/../../../plugins/explainer-page" && pwd)"
trap 'rm -rf "$work"' EXIT

mkdir -p "$DEMO_DIR"

# a dated page (pass), a long heading (fail), placeholders left (fail), a voice tell (warn), three quizzes with the answer in slot two (warn)
python3 - "$scaffold" "$DEMO_DIR/draft.html" <<'PY'
import re, sys

html = open(sys.argv[1]).read()
quiz = re.search(r'      <div class="quiz">.*?\n      </div>\n', html, re.S).group(0)

html = html.replace("DD Mon YYYY", "4 Nov 2026")
html = html.replace("<h2>A short noun phrase</h2>", "<h2>How the tide table is read, and why it is read that way</h2>")
html = html.replace("Body prose.", "Simply put, body prose.")
html = html.replace("    </section>\n\n    <section id=\"two\">", quiz + "    </section>\n\n    <section id=\"two\">")
html = html.replace("    </section>\n\n    </div>\n  </main>", quiz + "    </section>\n\n    </div>\n  </main>")

open(sys.argv[2], "w").write(html)
PY

(cd "$work" && vhs "$here/checks.tape")

# the bottom of the frame is the session's status line (spend and usage), so it is cropped off
ffmpeg -v error -y -i "$work/checks.mp4" \
    -vf "crop=1200:632:0:0,setpts=PTS/2,fps=8,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=none:diff_mode=rectangle" \
    explainer-page-checks.gif
echo "wrote $(pwd)/explainer-page-checks.gif"
