# Records a real prove-tests run on a two-test demo repo. Run it through record.bash, which sets DEMO_DIR and PLUGIN_DIR.
Output prove-tests.mp4

Set Shell "bash"
Set FontSize 16
Set Width 1200
Set Height 900
Set Padding 8
Set Framerate 10
Set TypingSpeed 40ms

Hide
Type "unset $(env | grep -o '^CLAUDE[A-Z_]*'); cd $DEMO_DIR && clear"
Enter
Type `claude --setting-sources project,local --settings '{"tui":"fullscreen"}' --plugin-dir $PLUGIN_DIR --permission-mode dontAsk --allowedTools 'Read' 'Edit' 'Bash(python3 -m unittest *)' 'Bash(cp *)' 'Bash(cmp *)' 'Bash(sed *)' 'Bash(git status*)' 'Bash(git diff*)'`
Enter
Sleep 10s
Down
Enter
Sleep 6s
Show

Type "/prove-tests --report-only test_tides.py (run one test with: python3 -m unittest test_tides.TideTest.<name>)"
Sleep 500ms
Enter
Wait+Screen@420s /Predicted failure/
Sleep 25s
