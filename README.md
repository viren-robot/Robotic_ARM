# ArmCtl — Robotic Arm Control Website

A single-file web app (`index.html`) to control a 6-axis servo robotic arm driven by a Raspberry Pi Pico W.

## Features

- **Joint control** for base, shoulder, elbow, wrist yaw, wrist roll and gripper, with a speed limit
- **Inverse kinematics**: type an X/Y/Z position and pitch, or jog the tool along each axis
- **Poses and sequences**: save poses and play them back in order
- **3D view** (three.js), with a 2D schematic fallback when offline
- **Simulator mode** with practice exercises, so you can try it without hardware
- **Calibration**: servo centres, limits, home pose, arm geometry
- **Pin assignments** with a Pico W pinout diagram, plus **NeoPixel** LED control
- **E-STOP** button (or press `Esc`)
- Light and dark themes, works on phones

## Quick start

1. Open `index.html` in a browser. It starts in **Simulator** mode.
2. To drive real hardware, go to **Settings → Pico W firmware**, enter your Wi-Fi details and click **Download main.py**.
3. Copy `main.py` and `index.html` onto the Pico W (e.g. with Thonny) and reboot it.
4. Browse to `http://<pico-ip>/` (or `http://192.168.4.1/` in access-point mode), switch to **Live** and click **Connect**.

You can also connect over USB (Web Serial, in Chrome or Edge) by choosing **USB** as the transport in Settings.

> Browsers block `ws://` connections from `https://` pages, so for Wi-Fi control open the page from the Pico itself or from a local file.
