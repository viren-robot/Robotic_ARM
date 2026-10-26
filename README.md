# ArmCtl — Robotic Arm Control Website

A single-file web app (`index.html`) to control a 4-axis 3D-printed robotic arm driven by **4× MG90S** servos and a Raspberry Pi Pico (or Pico W) **over USB**.

The arm is the "Robotic arm - brazo robótico" frame (8 printed parts): base, arm base, upper arm, forearm, gripper adapter, gripper base, gripper rack and gear.

| Joint    | Servo | Default pin | Range     |
|----------|-------|-------------|-----------|
| Base     | MG90S | GP0         | −90…90°   |
| Shoulder | MG90S | GP1         | −45…85°   |
| Elbow    | MG90S | GP2         | −60…90°   |
| Gripper  | MG90S | GP3         | 0…100 % (rack and pinion, ~21 mm jaw travel) |

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
- **Calibration** of servo centres, directions, limits and home pose. **Pin assignments** with a pinout diagram. **NeoPixel** LED control.
- **E-STOP** button (or press `Esc`). Light and dark themes. Works on phones (simulator only: phones have no Web Serial).

Arm dimensions, measured between the servo shafts in the STL files: shoulder axis 61 mm above the table, upper arm 81 mm, elbow to gripper tool point 121 mm (≈ 200 mm reach).

## Quick start

1. Open `index.html` in **Chrome or Edge** on a computer. It starts in **Simulator** mode. Try the Animate tab.
2. Install MicroPython on the Pico: hold BOOTSEL while plugging it in, then copy the MicroPython `.uf2` onto it.
3. In the page, go to **Settings → Pico firmware** and click **Download main.py**. Save it onto the Pico as `main.py` (e.g. with Thonny), then close Thonny.
4. Click **Connect USB**, pick the Pico, and switch to **Live**.
5. Calibrate each servo in the **Calibration** tab. Ideally do this before fitting the horns: drive the servo to its center, then fit the horn with the joint at its zero position.

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

- Servo signal wires go to GP0–GP3, and the NeoPixel data line to GP16.
- Power the servos from a separate 5 V supply (≥ 3 A), not from the Pico or USB.
- Connect the supply's ground to a Pico GND pin.

## USB protocol

One JSON object per line:

- `{"t":"pos","us":[…4 pulse widths…]}` sets the four servo pulse widths.
- `{"t":"off"}` releases the servos.
- `cfg`, `led`, `ping` and `hello` handle setup and the keep-alive.
