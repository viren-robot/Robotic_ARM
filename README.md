# ArmCtl — Robotic Arm Control Website

A single-file web app (`index.html`) to control a 4-axis 3D-printed robotic arm driven by **4× MG90S** servos and an **Arduino Uno** over **USB**.

The arm is the "Robotic arm - brazo robótico" frame (8 printed parts): base, arm base, upper arm, forearm, gripper adapter, gripper base, gripper rack and gear.

| Connection | Uno pin | Wire |
|------------|---------|------|
| Base servo (MG90S, −90…90°) | D3 | Signal wire, orange or yellow |
| Shoulder servo (MG90S, −45…85°) | D5 | Signal wire |
| Elbow servo (MG90S, −60…90°) | D6 | Signal wire |
| Gripper servo (MG90S, 0…100 %, ~21 mm jaw travel) | D9 | Signal wire |
| NeoPixel data (optional, off by default) | D7 | Add a 330 Ω resistor in series with the data line |

Pins and limits can be changed in the page. Any of D2–D13 and A0–A5 can be used; D0/D1 are the USB serial port.

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
  - **On the Arduino** (`armctl.ino`):
    - Every pulse is clamped to the servo's range.
    - A speed limit applies even if the page sends a jump.
    - The Arduino holds position if commands stop (USB unplugged, page closed).
    - **E-STOP** freezes the arm in place (or optionally releases the servos).
  - **Power check**: the page warns if the Uno restarts by itself, which almost always means the servos are powered from the Uno.
- **Calibration** of servo centres, directions, limits and home pose. **Pin assignments** with a pinout diagram. **NeoPixel** LED control.
- **E-STOP** button (or press `Esc`). Light and dark themes. Works on phones (simulator only: phones have no Web Serial).

Arm dimensions, measured between the servo shafts in the STL files: shoulder axis 61 mm above the table, upper arm 81 mm, elbow to gripper tool point 121 mm (≈ 200 mm reach).

## Quick start

1. Open `index.html` in **Chrome or Edge** on a computer. It starts in **Simulator** mode. Try the Animate tab.
2. Install the **Arduino IDE**. If you want NeoPixels, also install the **Adafruit NeoPixel** library (Sketch → Include Library → Manage Libraries).
3. In the page, go to **Settings → Arduino firmware** and click **Download armctl.ino**. Open it in the Arduino IDE (let it create the `armctl` folder), choose **Tools → Board → Arduino Uno** and your port, and click **Upload**.
4. Close the IDE's Serial Monitor, click **Connect USB** in the page, pick the Uno, and switch to **Live**. The Uno restarts when the page connects; the page waits about 2 seconds for it.
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

- **Servo signal wires** (orange or yellow): D3 base, D5 shoulder, D6 elbow, D9 gripper.
- **Servo power:** red wires to +5 V and brown/black wires to ground, from a separate 5 V supply (≥ 3 A). Not from the Uno's 5V pin or USB: the Uno would brown out and restart.
- **Common ground:** connect the supply's ground to a GND pin on the Uno.
- **NeoPixel (optional):** data line to D7 through a 330 Ω resistor. At most 60 LEDs (the Uno has 2 KB of RAM).

## USB protocol

115200 baud. The page sends one short text command per line, and the Uno answers with JSON lines.

| Command | Meaning |
|---|---|
| `P b s e g` | Servo pulse widths in µs (base, shoulder, elbow, gripper) |
| `S 0` / `S 1` | E-STOP: freeze in place / release the servos |
| `R` | Reset the E-STOP |
| `H` | Hold still |
| `C save timeout n [pin min max slew]… ledPin ledCount bpp khz800 order` | Settings (`save 1` stores them in EEPROM) |
| `L save effect r g b w r g b w brightness speed` | NeoPixel effect |
| `?` | Hello (firmware version) |
| `p id` | Ping |
