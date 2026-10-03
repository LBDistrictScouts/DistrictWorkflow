#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")/.."
platform=$(uname -s | tr '[:upper:]' '[:lower:]')
case "$(uname -m)" in
  arm64|aarch64) arch=arm64 ;;
  x86_64|amd64) arch=amd64 ;;
  *) echo 'Unsupported CPU architecture' >&2; exit 1 ;;
esac
case "$platform" in darwin|linux) ;; *) echo 'Use the Temporal CLI installer for your platform' >&2; exit 1 ;; esac
archive=$(mktemp)
trap 'rm -f "$archive"' EXIT
curl -fL "https://temporal.download/cli/archive/latest?platform=$platform&arch=$arch" -o "$archive"
mkdir -p .bin
tar -xzf "$archive" -C .bin temporal
.bin/temporal --version
