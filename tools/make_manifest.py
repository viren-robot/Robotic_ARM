#!/usr/bin/env python3
"""Write firmware/manifest.json for the STEAM_CAR page.

Usage: make_manifest.py OUT_DIR VERSION NAME=PATH [NAME=PATH ...]
Each PATH is a merged .bin (bootloader + partitions + app, flashed at offset 0x0).
The page checks size and SHA-256 against this file before it writes anything.
"""
import datetime
import hashlib
import json
import os
import shutil
import sys

CATALOG = {
    "steam_car": ("STEAM_CAR car firmware", "Motor control, the JSON-lines protocol, the 400 ms drive timeout and line following."),
    "ir_sensor_finder": ("IR sensor finder", "Prints the readings of candidate GPIO pins so you can find the line sensors. Not for driving the car."),
}


def main():
    out, version, items = sys.argv[1], sys.argv[2], sys.argv[3:]
    fw_dir = os.path.join(out, "firmware")
    os.makedirs(fw_dir, exist_ok=True)
    firmware = []
    for item in items:
        name, src = item.split("=", 1)
        data = open(src, "rb").read()
        dst = f"{name}-{version}.bin"
        shutil.copyfile(src, os.path.join(fw_dir, dst))
        title, desc = CATALOG.get(name, (name, ""))
        firmware.append({
            "name": title,
            "id": name,
            "file": dst,
            "version": version,
            "description": desc,
            "size": len(data),
            "sha256": hashlib.sha256(data).hexdigest(),
            "flash_offset": 0,
        })
    manifest = {
        "schema": 1,
        "project": "STEAM_CAR",
        "version": version,
        "chip": "esp32",
        "build_time": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "flash": {"mode": "dio", "freq": "40m", "size": "detect", "note": "merged image, written at offset 0x0"},
        "firmware": firmware,
    }
    with open(os.path.join(fw_dir, "manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
        f.write("\n")
    print(json.dumps({"version": version, "files": [(x["file"], x["size"], x["sha256"][:12]) for x in firmware]}, indent=1))


if __name__ == "__main__":
    main()
