#!/bin/sh
# Builds Lantern.saver and installs it for this user (LANTERN_PORT, if set, is the server's port). Then pick "Lantern" in System Settings > Screen Saver.
set -e
cd "$(dirname "$0")"
OUT=build/Lantern.saver
rm -rf build && mkdir -p "$OUT/Contents/MacOS"
cp Info.plist "$OUT/Contents/"
plutil -replace LanternPort -string "${LANTERN_PORT:-7717}" "$OUT/Contents/Info.plist" # the server's port: screensavers don't get your env
swiftc -O -module-name Lantern -emit-executable -Xlinker -bundle \
  -framework ScreenSaver -framework WebKit \
  -o "$OUT/Contents/MacOS/Lantern" LanternView.swift
codesign --force --sign - "$OUT"
mkdir -p "$HOME/Library/Screen Savers"
rm -rf "$HOME/Library/Screen Savers/Lantern.saver"
cp -R "$OUT" "$HOME/Library/Screen Savers/"
echo "Installed ~/Library/Screen Savers/Lantern.saver"
