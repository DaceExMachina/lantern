#!/bin/sh
# Builds Lantern.app (with the Lantern server inside) from source and installs it in ~/Applications (or wherever $1 says).
# It's signed ad hoc on this Mac and never downloaded, so it isn't quarantined and opens without a Gatekeeper prompt.
set -e
cd "$(dirname "$0")"
DEST=${1:-"$HOME/Applications"}
OUT=build/Lantern.app
[ -f ../dist/index.html ] || { echo "Build the page first: npm install && npm run build" >&2; exit 1; }
rm -rf build && mkdir -p "$OUT/Contents/MacOS" "$OUT/Contents/Resources" build/Lantern.iconset
cp Info.plist "$OUT/Contents/"
# the built page rides along inside the app
cp -R ../dist "$OUT/Contents/Resources/"
for s in 16 32 128 256 512; do
  sips -z $s $s ../dist/icon.png --out build/Lantern.iconset/icon_${s}x${s}.png >/dev/null
  [ $s = 512 ] || sips -z $((s * 2)) $((s * 2)) ../dist/icon.png --out build/Lantern.iconset/icon_${s}x${s}@2x.png >/dev/null
done
iconutil -c icns -o "$OUT/Contents/Resources/Lantern.icns" build/Lantern.iconset
swiftc -O -target "$(uname -m)-apple-macos13" -framework AppKit -framework WebKit -o "$OUT/Contents/MacOS/Lantern" *.swift
# the now playing helper, which the server has /usr/bin/perl load (NowPlaying.swift)
swiftc -O -target "$(uname -m)-apple-macos13" -parse-as-library -emit-library -o "$OUT/Contents/MacOS/NowPlaying.dylib" helper/NowPlayingHelper.swift
codesign --force --sign - "$OUT"
mkdir -p "$DEST"
rm -rf "$DEST/Lantern.app" # also replaces a Safari "Add to Dock" Lantern, which lives at the same path
cp -R "$OUT" "$DEST/"
echo "Installed $DEST/Lantern.app"
