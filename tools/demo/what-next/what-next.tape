# Records the what-next pane listing proposals and issues, then switching tabs and reading a proposal. Run it through record.bash, which sets DEMO_DIR, PLUGIN_DIR and STUB_DIR.
Output what-next.mp4

Set Shell "bash"
Set FontSize 16
Set Width 1200
Set Height 900
Set Padding 8
Set Framerate 10
Set TypingSpeed 40ms

Hide
Type "unset $(env | grep -o '^CLAUDE[A-Z_]*'); export PATH=$STUB_DIR:$PATH; cd $DEMO_DIR && clear"
Enter
Type `claude --setting-sources project,local --settings '{"tui":"fullscreen"}' --plugin-dir $PLUGIN_DIR --model sonnet`
Enter
Sleep 10s
Down
Enter
Sleep 6s
Show

Type "/next"
Sleep 500ms
Enter
Sleep 4s
Tab
Sleep 500ms
Type "i"
Sleep 3s
Type "p"
Sleep 3s
Enter
Sleep 3s
Type "b"
Sleep 3s
