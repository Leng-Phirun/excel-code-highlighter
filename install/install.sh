#!/bin/sh
# Installs Code Highlighter for Excel on a Mac. Run it in Terminal:
#
#   curl -fsSL https://leng-phirun.github.io/excel-code-highlighter/install.sh | sh
#
# It downloads the add-in's manifest into Excel's add-in folder
# (~/Library/Containers/com.microsoft.Excel/Data/Documents/wef), where Excel picks it up.
#
# The build replaces https://localhost:3000/ with the address the add-in is hosted at.
set -eu

site="https://localhost:3000/"
addin_id="61510d37-86c6-4098-95c3-ee4c889899c1"
container="$HOME/Library/Containers/com.microsoft.Excel"
wef="$container/Data/Documents/wef"

echo ""
echo "Installing Code Highlighter for Excel"

if [ ! -d "$container" ]; then
  echo "Excel hasn't been opened on this Mac yet. Open Excel once, quit it, and run this again."
  exit 1
fi

mkdir -p "$wef"
download="$(mktemp)"
trap 'rm -f "$download"' EXIT
curl -fsSL "${site}manifest.xml" -o "$download"
if ! grep -q "$addin_id" "$download"; then
  echo "The file downloaded from $site isn't the Code Highlighter manifest."
  exit 1
fi
cp "$download" "$wef/code-highlighter.xml"
echo "  Copied the manifest to $wef"

echo ""
echo "Done. Next step:"
echo "  Quit Excel completely (Cmd+Q) and open it again, then choose"
echo "  Home > Add-ins and select Code Highlighter under Developer Add-ins."
echo "  If the Code buttons are missing after you restart Excel, select it there again."
echo ""
echo "  Help: ${site}support.html"
echo ""
