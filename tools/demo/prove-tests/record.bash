#!/usr/bin/env bash
# Records a real prove-tests run on a two-test demo repo, as ./prove-tests.gif: one test is killed, the other compares the code to itself and survives.
# Needs vhs, ttyd, ffmpeg and python3, and claude on the PATH; the run loads the plugin from this checkout and uses the signed-in Claude account.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
work="$(mktemp -d)"
export DEMO_DIR="$work/tide-notes"
export PLUGIN_DIR="$(cd "$here/../../../plugins/prove-tests" && pwd)"
trap 'rm -rf "$work"' EXIT

mkdir -p "$DEMO_DIR"
cat > "$DEMO_DIR/tides.py" <<'PY'
def is_high(height, threshold):
    return height >= threshold


def tide_label(height, threshold):
    return "high" if is_high(height, threshold) else "low"
PY
cat > "$DEMO_DIR/test_tides.py" <<'PY'
import unittest

from tides import is_high, tide_label


class TideTest(unittest.TestCase):
    def test_high_at_threshold(self):
        self.assertTrue(is_high(2.0, 2.0))

    def test_labels_low_tide(self):
        self.assertEqual(tide_label(1.0, 2.0), tide_label(1.0, 2.0))


if __name__ == "__main__":
    unittest.main()
PY
git -C "$DEMO_DIR" init -q
git -C "$DEMO_DIR" add -A
git -C "$DEMO_DIR" -c user.name=demo -c user.email=demo@example.com commit -qm "tide helpers and tests"

(cd "$work" && vhs "$here/prove-tests.tape")

# the bottom of the frame is the session's status line (spend and usage), so it is cropped off
ffmpeg -v error -y -i "$work/prove-tests.mp4" \
    -vf "crop=1200:632:0:0,setpts=PTS/2,fps=8,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=none:diff_mode=rectangle" \
    prove-tests.gif
echo "wrote $(pwd)/prove-tests.gif"
