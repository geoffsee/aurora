#!/usr/bin/env bash
set -euo pipefail

PLATFORM="${1:?usage: package-desktop.sh <macos-aarch64|macos-x64|linux-x64|windows-x64>}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="$ROOT/dist/desktop"
STAGE="$OUT_DIR/stage-$PLATFORM"
ARCHIVE_DIR="$OUT_DIR/archives"
mkdir -p "$ARCHIVE_DIR"
rm -rf "$STAGE"

require_file() {
	if [[ ! -f "$1" ]]; then
		echo "missing required file: $1" >&2
		exit 1
	fi
}

require_dir() {
	if [[ ! -d "$1" ]]; then
		echo "missing required directory: $1" >&2
		exit 1
	fi
}

stage_resources() {
	local dest="$1"
	mkdir -p "$dest/dist/pkg" "$dest/assets"
	cp "$ROOT/index.html" "$ROOT/controls.html" "$ROOT/styles.css" "$ROOT/controls.css" "$dest/"
	cp -R "$ROOT/dist/pkg/." "$dest/dist/pkg/"
	cp -R "$ROOT/assets/." "$dest/assets/"
}

write_info_plist() {
	local plist="$1"
	cat >"$plist" <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>CFBundleDevelopmentRegion</key>
	<string>en</string>
	<key>CFBundleExecutable</key>
	<string>bevyosc</string>
	<key>CFBundleIdentifier</key>
	<string>dev.bevyosc.app</string>
	<key>CFBundleName</key>
	<string>bevyosc</string>
	<key>CFBundlePackageType</key>
	<string>APPL</string>
	<key>CFBundleShortVersionString</key>
	<string>0.1.0</string>
	<key>CFBundleVersion</key>
	<string>0.1.0</string>
	<key>LSMinimumSystemVersion</key>
	<string>13.0</string>
	<key>NSHighResolutionCapable</key>
	<true/>
</dict>
</plist>
EOF
}

require_dir "$ROOT/dist/pkg"
require_dir "$ROOT/assets"

case "$PLATFORM" in
macos-aarch64)
	LAUNCHER_BIN="${LAUNCHER_BIN:-$ROOT/target-launcher/aarch64-apple-darwin/release/bevyosc}"
	if [[ ! -f "$LAUNCHER_BIN" ]]; then
		LAUNCHER_BIN="$ROOT/target-launcher/release/bevyosc"
	fi
	BRIDGE_BIN="${BRIDGE_BIN:-$OUT_DIR/bevyosc-bridge}"
	require_file "$LAUNCHER_BIN"
	require_file "$BRIDGE_BIN"

	APP="$STAGE/bevyosc.app"
	BIN="$APP/Contents/MacOS"
	RES="$APP/Contents/Resources"
	mkdir -p "$BIN" "$RES"
	cp "$LAUNCHER_BIN" "$BIN/bevyosc"
	cp "$BRIDGE_BIN" "$BIN/bevyosc-bridge"
	chmod +x "$BIN/bevyosc" "$BIN/bevyosc-bridge"
	stage_resources "$RES"
	write_info_plist "$APP/Contents/Info.plist"

	ARCHIVE="$ARCHIVE_DIR/bevyosc-$PLATFORM.zip"
	(
		cd "$STAGE"
		rm -f "$ARCHIVE"
		zip -r "$ARCHIVE" bevyosc.app
	)
	;;
macos-x64)
	LAUNCHER_BIN="${LAUNCHER_BIN:-$ROOT/target-launcher/x86_64-apple-darwin/release/bevyosc}"
	if [[ ! -f "$LAUNCHER_BIN" ]]; then
		LAUNCHER_BIN="$ROOT/target-launcher/release/bevyosc"
	fi
	BRIDGE_BIN="${BRIDGE_BIN:-$OUT_DIR/bevyosc-bridge}"
	require_file "$LAUNCHER_BIN"
	require_file "$BRIDGE_BIN"

	APP="$STAGE/bevyosc.app"
	BIN="$APP/Contents/MacOS"
	RES="$APP/Contents/Resources"
	mkdir -p "$BIN" "$RES"
	cp "$LAUNCHER_BIN" "$BIN/bevyosc"
	cp "$BRIDGE_BIN" "$BIN/bevyosc-bridge"
	chmod +x "$BIN/bevyosc" "$BIN/bevyosc-bridge"
	stage_resources "$RES"
	write_info_plist "$APP/Contents/Info.plist"

	ARCHIVE="$ARCHIVE_DIR/bevyosc-$PLATFORM.zip"
	(
		cd "$STAGE"
		rm -f "$ARCHIVE"
		zip -r "$ARCHIVE" bevyosc.app
	)
	;;
linux-x64)
	LAUNCHER_BIN="${LAUNCHER_BIN:-$ROOT/target-launcher/release/bevyosc}"
	BRIDGE_BIN="${BRIDGE_BIN:-$OUT_DIR/bevyosc-bridge}"
	require_file "$LAUNCHER_BIN"
	require_file "$BRIDGE_BIN"

	BUNDLE="$STAGE/bevyosc"
	mkdir -p "$BUNDLE"
	cp "$LAUNCHER_BIN" "$BUNDLE/bevyosc"
	cp "$BRIDGE_BIN" "$BUNDLE/bevyosc-bridge"
	chmod +x "$BUNDLE/bevyosc" "$BUNDLE/bevyosc-bridge"
	stage_resources "$BUNDLE"

	ARCHIVE="$ARCHIVE_DIR/bevyosc-$PLATFORM.tar.gz"
	tar -C "$STAGE" -czf "$ARCHIVE" bevyosc
	;;
windows-x64)
	LAUNCHER_BIN="${LAUNCHER_BIN:-$ROOT/target-launcher/release/bevyosc.exe}"
	BRIDGE_BIN="${BRIDGE_BIN:-$OUT_DIR/bevyosc-bridge.exe}"
	require_file "$LAUNCHER_BIN"
	require_file "$BRIDGE_BIN"

	BUNDLE="$STAGE/bevyosc"
	mkdir -p "$BUNDLE"
	cp "$LAUNCHER_BIN" "$BUNDLE/bevyosc.exe"
	cp "$BRIDGE_BIN" "$BUNDLE/bevyosc-bridge.exe"
	stage_resources "$BUNDLE"

	ARCHIVE="$ARCHIVE_DIR/bevyosc-$PLATFORM.zip"
	(
		cd "$STAGE"
		rm -f "$ARCHIVE"
		zip -r "$ARCHIVE" bevyosc
	)
	;;
*)
	echo "unknown platform: $PLATFORM" >&2
	exit 1
	;;
esac

echo "packaged: $ARCHIVE"
