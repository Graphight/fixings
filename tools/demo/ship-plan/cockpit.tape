# Records a real /ship-plan run with the cockpit pane. Run it through record.bash, which sets DEMO_DIR.
Output cockpit.mp4

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
Type "claude --model sonnet"
Enter
Sleep 10s
Down
Enter
Sleep 6s
Show

Type "/plan-timeline"
Sleep 500ms
Enter
Sleep 3s
Type "/ship-plan"
Sleep 500ms
Enter
Wait+Screen@420s /HALTED/
Sleep 12s
