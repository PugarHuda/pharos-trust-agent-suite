# VHS tape — records a REAL terminal actually running `node demo.mjs`, which executes the read-only
# CLI of all 13 skills live against Pharos Atlantic (no keys, nothing broadcast). Renders to mp4.
# Run via the demo-terminal GitHub Action, or locally: `vhs video/demo.tape` from the repo root.

Output video/out/pharos-terminal.mp4

Set Shell bash
Set FontFamily "DejaVu Sans Mono"
Set FontSize 14
Set Width 1320
Set Height 780
Set Padding 18
Set Theme "Dracula"

Type "node demo.mjs"
Enter
# wait until the final line prints (all 13 skills have run), with a generous cap
Wait+Screen@300s /trust layer for the Pharos agent economy/
Sleep 4s
