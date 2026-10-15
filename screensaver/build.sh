#!/bin/sh
# Builds Lantern.saver and installs it for this user. Then pick "Lantern" in System Settings > Screen Saver.
set -e
cd "$(dirname "$0")"
OUT=build/Lantern.saver
rm -rf build && mkdir -p "$OUT/Contents/MacOS"
cp Info.plist "$OUT/Contents/"
swiftc -O -module-name Lantern -emit-executable -Xlinker -bundle \
  -framework ScreenSaver -framework WebKit \
  -o "$OUT/Contents/MacOS/Lantern" LanternView.swift
codesign --force --sign - "$OUT"
mkdir -p "$HOME/Library/Screen Savers"
rm -rf "$HOME/Library/Screen Savers/Lantern.saver"
cp -R "$OUT" "$HOME/Library/Screen Savers/"
echo "Installed ~/Library/Screen Savers/Lantern.saver"
