#!/usr/bin/env bash
# Builds both STEAM_CAR sketches with arduino-cli and writes public/firmware/ + manifest.json (copied into dist/ by Vite).
# Needs arduino-cli (version and ESP32 core pinned in .github/workflows/pages.yml).
#   usage: tools/build_firmware.sh [VERSION]      (VERSION defaults to git describe)
set -euo pipefail
cd "$(dirname "$0")/.."
VERSION="${1:-$(git describe --tags --always --dirty 2>/dev/null || echo dev)}"
FQBN=esp32:esp32:esp32
OUT=public
rm -rf "$OUT/firmware" build && mkdir -p build "$OUT"
for sk in steam_car ir_sensor_finder; do
  # copy the sketch so the version header can be written next to it (no shell quoting of the version)
  mkdir -p "build/src/$sk"
  cp "firmware/$sk/$sk.ino" "build/src/$sk/"
  printf '#define FW_VERSION "%s"\n' "$VERSION" > "build/src/$sk/fw_version.h"
  arduino-cli compile --fqbn "$FQBN" --warnings default --output-dir "build/$sk" "build/src/$sk"
  test -f "build/$sk/$sk.ino.merged.bin"
done
python3 tools/make_manifest.py "$OUT" "$VERSION" \
  "steam_car=build/steam_car/steam_car.ino.merged.bin" \
  "ir_sensor_finder=build/ir_sensor_finder/ir_sensor_finder.ino.merged.bin"
