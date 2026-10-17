#!/bin/sh
# Removes Code Highlighter for Excel from a Mac. Run it in Terminal:
#
#   curl -fsSL https://leng-phirun.github.io/excel-code-highlighter/uninstall.sh | sh
set -eu

manifest="$HOME/Library/Containers/com.microsoft.Excel/Data/Documents/wef/code-highlighter.xml"

if [ -f "$manifest" ]; then
  rm "$manifest"
  echo "Removed $manifest"
  echo "Quit Excel completely (Cmd+Q) and open it again."
else
  echo "Code Highlighter isn't installed in Excel's add-in folder."
fi
