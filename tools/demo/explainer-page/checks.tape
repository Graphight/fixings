# Records the checks pane filling after one Edit to a draft page. Run it through record.bash, which sets DEMO_DIR.
Output checks.mp4

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

Type "/explainer-page-checks"
Sleep 500ms
Enter
Sleep 3s
Type "In draft.html, change the second section's heading from 'Second claim' to 'What the pane reads'. Make only that edit."
Sleep 500ms
Enter
Wait+Screen@120s /not published/
Sleep 12s
