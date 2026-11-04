# Records the github-pr-review panel filling from a hand-made sidecar. Run it through record.bash, which sets DEMO_DIR, PLUGIN_DIR and SIDECAR.
Output github-pr-review.mp4

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
Type "claude --plugin-dir $PLUGIN_DIR --model sonnet --permission-mode acceptEdits"
Enter
Sleep 10s
Down
Enter
Sleep 6s
Show

Type "/github-pr-review-panel"
Sleep 500ms
Enter
Sleep 3s
Type "Run `bash $DEMO_DIR/fill.bash $SIDECAR 1`, then wait for it to finish and run it again with 2, then with 3. Run each as its own Bash call and say nothing else."
Sleep 500ms
Enter
Wait+Screen@180s /COMMENT/
Sleep 12s
