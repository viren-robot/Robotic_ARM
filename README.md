# ArmCtl — Robotic Arm Control Website

A single-file web app (`index.html`) to control a 4-axis 3D-printed robotic arm driven by **4× MG90S** servos and a Raspberry Pi Pico (or Pico W) **over USB**.

The arm is the "Robotic arm - brazo robótico" frame (8 printed parts): base, arm base, upper arm, forearm, gripper adapter, gripper base, gripper rack and gear.

| Connection | Pico pin | Wire |
|------------|----------|------|
| Base servo (MG90S, −90…90°) | GP0 | Signal wire, orange or yellow |
| Shoulder servo (MG90S, −45…85°) | GP2 | Signal wire |
| Elbow servo (MG90S, −60…90°) | GP4 | Signal wire |
| Gripper servo (MG90S, 0…100 %, ~21 mm jaw travel) | GP6 | Signal wire |
| NeoPixel data (optional) | GP15 | Add a 330 Ω resistor in series with the data line |

Pins and limits can be changed in the page.

## Features

- **Animations** (Animate tab):
  - Build keyframe animations on a timeline and play them on the simulator or the real arm.
  - **Joint** moves turn all joints together. **Straight** moves drive the gripper along a straight line using inverse kinematics.
  - Smooth or linear easing, loop, and 0.25×–2× playback speed.
  - Drag on the timeline to scrub, and drag keyframes to retime them.
  - **Record** turns your live movements into keyframes.
  - Segments faster than an MG90S can turn, or straight lines the arm can't follow, are marked red.
  - Built-in examples: *Pick and place* and *Wave*. Animations can be exported and imported as JSON.
- **Inverse kinematics (IK)**:
  - Drag the blue ball in the 3D view to move the gripper.
  - Or type an X/Y/Z target, or jog it with the arrow keys and buttons.
  - The arm has no wrist, so the gripper always points along the forearm.
- **Simulator mode**: everything (joints, IK, animations) runs on the 3D model with realistic MG90S speeds, and nothing is sent to the arm. Includes practice exercises. Switch to **Live** to drive the real arm.
- **3D view of the printed frame**: the STL parts are built into the page and move like the real arm, including the gripper rack and gear. There's a 2D fallback when offline.
- **USB connection** (Web Serial): choose which port the commands go to from the dropdown next to **Connect USB** (or in Settings → Ports). Pick **Choose another port…** to open the browser's picker, which shows the COM / tty names. The choice is remembered, and the page reconnects when that port is plugged back in.
- **Safety system** (Safety tab), so the arm doesn't break:
  - **Collision guard**: every move (sliders, keys, IK, poses, animations) is checked first. A move that would hit the table, the base, the shoulder or the upper arm is stopped.
  - **Joint limits** and calibrated servo **min/max angles** are never exceeded.
  - **Smooth motion**: speed and acceleration limits.
  - **Animation check**: animations with red segments (too fast, unreachable, collision) can't play on the real arm.
  - **On the Pico** (`main.py`):
    - Every pulse is clamped to the servo's range.
    - A speed limit applies even if the page sends a jump.
    - The Pico holds position if commands stop (USB unplugged, page closed).
    - **E-STOP** freezes the arm in place (or optionally releases the servos).
- **Calibration** of servo centres, directions, limits and home pose. **Pin assignments** with a pinout diagram. **NeoPixel** LED control.
- **Assembly guide** (Assembly tab): 11 steps in the 3D view. The parts for each step slide into place in blue, the camera follows, and the last step plays a test movement. Includes a button that moves the servos to the assembly position before you fit the horns.
- **main.py upload from the page**: one click copies the firmware onto the Pico over USB, no Thonny needed.
- **E-STOP** button (or press `Esc`). Light and dark themes. Works on phones (simulator only: phones have no Web Serial).

Arm dimensions, measured between the servo shafts in the STL files: shoulder axis 61 mm above the table, upper arm 81 mm, elbow to gripper tool point 121 mm (≈ 200 mm reach).

## Quick start

1. Open `index.html` in **Chrome or Edge** on a computer. It starts in **Simulator** mode. Try the Animate tab.
2. Install MicroPython on the Pico (once): hold BOOTSEL while plugging it in, then copy the MicroPython `.uf2` ([micropython.org](https://micropython.org/download/RPI_PICO/), or RPI_PICO_W for a Pico W) onto the RPI-RP2 drive.
3. In the page, go to **Settings → Pico firmware** and click **Upload to Pico**. The page copies `main.py` onto the Pico over USB (no Thonny needed), checks it, starts it and connects. Close Thonny first if it's open. To copy it by hand instead, use "Copy main.py yourself instead" in the same card.
4. Switch to **Live**. Next time, just click **Connect USB**.
5. Building the arm? Follow the **Assembly** tab step by step.
6. Calibrate each servo in the **Calibration** tab. Ideally do this before fitting the horns: drive the servo to its center, then fit the horn with the joint at its zero position.

## Built-in main.py uploader

**Upload to Pico** uses MicroPython's raw REPL over the same USB port: Ctrl-C stops the running `main.py`, Ctrl-A enters raw mode, and the file is written in small blocks to `main.py.tmp`. The page then reads back its length and checksum, and renames it to `main.py`, so an interrupted upload leaves the old one working. It also deletes `arm_cfg.json` (settings saved from the page), so the settings built into the new `main.py` apply, and soft-reboots the Pico to start it.

## Keyboard

| Key | Action |
|---|---|
| `Q`/`A`, `W`/`S`, `E`/`D`, `R`/`F` | Base, shoulder, elbow, gripper |
| Arrow keys, `PgUp`/`PgDn` | Move the gripper with IK |
| `Space` | Play / pause the animation |
| `K` | Add a keyframe |
| `Home` | Home pose |
| `Esc` | E-STOP |

## Wiring

- **Servo signal wires** (orange or yellow): GP0 base, GP2 shoulder, GP4 elbow, GP6 gripper.
- **Servo power:** red wires to +5 V and brown/black wires to ground, from a separate 5 V supply (≥ 3 A), not from the Pico or USB.
- **Common ground:** connect the supply's ground to a Pico GND pin.
- **NeoPixel (optional):** data line to GP15 through a 330 Ω resistor.

## USB protocol

One JSON object per line:

- `{"t":"pos","us":[…4 pulse widths…]}` sets the four servo pulse widths.
- `{"t":"off"}` releases the servos.
- `cfg`, `led`, `ping` and `hello` handle setup and the keep-alive.
