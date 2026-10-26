# ArmCtl — Robotic Arm Control Website

A single-file web app (`index.html`) to control a 4-axis 3D-printed robotic arm driven by **4× MG90S** servos and a Raspberry Pi Pico W.

The arm is the "Robotic arm - brazo robótico" frame (8 printed parts): base, arm base, upper arm, forearm, gripper adapter, gripper base, gripper rack and gear.

| Joint    | Servo | Default pin | Range     |
|----------|-------|-------------|-----------|
| Base     | MG90S | GP0         | −90…90°   |
| Shoulder | MG90S | GP1         | −45…85°   |
| Elbow    | MG90S | GP2         | −60…90°   |
| Gripper  | MG90S | GP3         | 0…100 % (rack and pinion, ~21 mm jaw travel) |

Pins and limits can be changed in the page.

## Features

- **Joint control** for base, shoulder, elbow and gripper, with a speed limit
- **Inverse kinematics**: type an X/Y/Z position or jog the gripper along each axis. The arm has no wrist, so the gripper always points along the forearm.
- **3D view of the printed frame**: the STL parts are built into the page (simplified to ~100 KB) and move like the real arm, including the gripper rack and gear. There's a 2D fallback when offline.
- **Poses and sequences**: save poses and play them back in order
- **Simulator mode** with practice exercises, so you can try it without hardware
- **Calibration**: servo centres, directions, limits and home pose
- **Pin assignments** with a Pico W pinout diagram, plus **NeoPixel** LED control
- **E-STOP** button (or press `Esc`)
- Light and dark themes, works on phones

Arm dimensions, measured between the servo shafts in the STL files: shoulder axis 61 mm above the table, upper arm 81 mm, elbow to gripper tool point 121 mm (≈ 200 mm reach).

## Quick start

1. Open `index.html` in a browser. It starts in **Simulator** mode.
2. To drive real hardware, go to **Settings → Pico W firmware**, enter your Wi-Fi details and click **Download main.py**.
3. Copy `main.py` and `index.html` onto the Pico W (e.g. with Thonny) and reboot it.
4. Browse to `http://<pico-ip>/` (or `http://192.168.4.1/` in access-point mode), switch to **Live** and click **Connect**.
5. Calibrate each servo in the **Calibration** tab. Ideally do this before fitting the horns: drive the servo to its center, then fit the horn with the joint at its zero position.

You can also connect over USB (Web Serial, in Chrome or Edge) by choosing **USB** as the transport in Settings.

> Browsers block `ws://` connections from `https://` pages, so for Wi-Fi control open the page from the Pico itself or from a local file.

## Wiring

- Servo signal wires go to GP0–GP3, and the NeoPixel data line to GP16.
- Power the servos from a separate 5 V supply (≥ 3 A), not from the Pico.
- Connect the supply's ground to a Pico GND pin.
