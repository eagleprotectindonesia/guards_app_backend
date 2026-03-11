#!/usr/bin/env bash

set -euo pipefail

SDK_ROOT="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-$HOME/Android/Sdk}}"
CMDLINE_TOOLS_VERSION="${CMDLINE_TOOLS_VERSION:-13114758}"
CMDLINE_TOOLS_URL="https://dl.google.com/android/repository/commandlinetools-linux-${CMDLINE_TOOLS_VERSION}_latest.zip"

mkdir -p "$SDK_ROOT/cmdline-tools"

tmp_dir="$(mktemp -d)"
cleanup() {
  rm -rf "$tmp_dir"
}
trap cleanup EXIT

archive="$tmp_dir/commandlinetools.zip"
extract_dir="$tmp_dir/extracted"

echo "Downloading Android command-line tools to $archive"
wget -O "$archive" "$CMDLINE_TOOLS_URL"

mkdir -p "$extract_dir"
unzip -q "$archive" -d "$extract_dir"

rm -rf "$SDK_ROOT/cmdline-tools/latest"
mkdir -p "$SDK_ROOT/cmdline-tools/latest"
cp -R "$extract_dir/cmdline-tools/." "$SDK_ROOT/cmdline-tools/latest/"

export ANDROID_HOME="$SDK_ROOT"
export ANDROID_SDK_ROOT="$SDK_ROOT"
export PATH="$ANDROID_SDK_ROOT/cmdline-tools/latest/bin:$ANDROID_SDK_ROOT/platform-tools:$PATH"

yes | sdkmanager --sdk_root="$ANDROID_SDK_ROOT" --licenses >/dev/null
sdkmanager --sdk_root="$ANDROID_SDK_ROOT" \
  "platform-tools" \
  "platforms;android-35" \
  "build-tools;35.0.0"

echo
echo "Android SDK installed in: $ANDROID_SDK_ROOT"
echo "Add the environment exports from apps/mobile/scripts/android-env.sh to your shell profile."
