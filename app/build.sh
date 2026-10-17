#!/bin/sh
# Builds Lantern.app (with the Lantern server inside) from source and installs it in ~/Applications (or wherever $1 says).
# It's signed ad hoc on this Mac and never downloaded, so it isn't quarantined and opens without a Gatekeeper prompt.
set -e
cd "$(dirname "$0")"
DEST=${1:-"$HOME/Applications"}
OUT=build/Lantern.app
rm -rf build && mkdir -p "$OUT/Contents/MacOS" "$OUT/Contents/Resources" build/Lantern.iconset
cp Info.plist "$OUT/Contents/"
# the page rides along inside the app
cp ../index.html ../icon.svg ../icon.png ../icon-indigo.svg ../icon-indigo.png "$OUT/Contents/Resources/"
for s in 16 32 128 256 512; do
  sips -z $s $s ../icon.png --out build/Lantern.iconset/icon_${s}x${s}.png >/dev/null
  [ $s = 512 ] || sips -z $((s * 2)) $((s * 2)) ../icon.png --out build/Lantern.iconset/icon_${s}x${s}@2x.png >/dev/null
done
iconutil -c icns -o "$OUT/Contents/Resources/Lantern.icns" build/Lantern.iconset
swiftc -O -target "$(uname -m)-apple-macos13" -framework AppKit -framework WebKit -o "$OUT/Contents/MacOS/Lantern" main.swift Server.swift
codesign --force --sign - "$OUT"
mkdir -p "$DEST"
rm -rf "$DEST/Lantern.app" # also replaces a Safari "Add to Dock" Lantern, which lives at the same path
cp -R "$OUT" "$DEST/"
echo "Installed $DEST/Lantern.app"
