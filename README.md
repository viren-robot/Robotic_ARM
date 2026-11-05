# STEAM_CAR

Control page, firmware and browser flasher for a two-wheel car built on the **STEMpedia Quarky** (classic ESP32).

- **Control page** (React + @lobehub/ui, in `src/`): drive with a joystick or the keyboard, or follow a line. It talks to the car over USB with Web Serial (Chrome or Edge). A Simulator with a virtual car works without any hardware.
- **Car firmware** (`firmware/steam_car/steam_car.ino`): motor control, the JSON-lines protocol, and line following on the board.
- **IR sensor finder** (`firmware/ir_sensor_finder/ir_sensor_finder.ino`): finds the GPIO pins of the line sensors.
- **Flash firmware tab**: installs either firmware from the browser, with no Arduino IDE needed. It uses esptool-js 0.7.0, vendored in `vendor/esptool-js-0.7.0/`.

Live site (GitHub Pages): **https://viren-robot.github.io/Steam_CAR/** (enable it once: Settings → Pages → Source: **GitHub Actions**).

## Quick start

1. Open the site in **Chrome** or **Edge** on a computer.
2. Go to **Flash firmware**, click **Choose port & detect chip**, and pick the Quarky's port. The page checks that the board is a classic ESP32 and shows its chip and MAC address.
3. Choose **STEAM_CAR car firmware** and click **Flash firmware**. The page downloads the file, checks its SHA-256 against `firmware/manifest.json`, writes it, resets the board, and reconnects.
4. Choose **Real car (USB)** at the top of the page and click **Connect USB**.

To try the page first, leave **Simulator** selected: everything works without the car.

## Driving

| Mode | How |
|---|---|
| **MANUAL** | Joystick (drag) or `W` `A` `S` `D` / arrow keys. `Space` or `Esc` stops. Commands go out 20 times a second; the car stops by itself if they stop arriving for 0.4 s. |
| **LINE FOLLOW** | Two IR sensors on the car decide the steering. The car runs its own loop; the page only has to keep talking to it (silence for 2 s stops the car). |

The page converts **forward speed `v`** and **turn rate `w`** (both −100…100 %) into wheel speeds:

```
left  = v − w·T/2        right = v + w·T/2        T = track width (mm)
```

If one wheel would go past 100 %, both are scaled by the same factor. The page shows the live left/right values and a top-down view with the turning arc. Track width and wheel diameter are in **Settings**, together with invert and swap for each motor.

**Click to go** (Drive tab) drives to a point on the map. The car has no encoders, so its position is estimated by dead reckoning and drifts. Treat it as a rough guide.

## Pins

| Function | GPIO | Set in |
|---|---|---|
| Motor L speed (PWM) | 16 | `LEFT_PWM_PIN` |
| Motor R speed (PWM) | 17 | `RIGHT_PWM_PIN` |
| Motor L direction | not set | `LEFT_DIR_PIN` |
| Motor R direction | not set | `RIGHT_DIR_PIN` |
| Left line sensor | not set | `IR_LEFT_PIN` |
| Right line sensor | not set | `IR_RIGHT_PIN` |

Pins marked **not set** are `-1` in the firmware. That is deliberate:

- **No direction pins → no reverse.** A single-pin motor driver only spins forward, so negative wheel speeds are limited to 0. Set the direction pins to get reverse; the code is the `onDrive()` pattern of the Robot-car library.
- **No sensor pins → no line follow.** The page then shows "line follow not available" and says why.

Find the sensor pins with the **IR sensor finder** firmware (Flash tab → choose it → flash). It prints a `CHANGED` line each time a pin's reading changes. Move each sensor onto the line and back: the pin that changes is that sensor's. Then put the numbers in `steam_car.ino` and flash the car firmware again.

The motor code is taken unchanged from the Robot-car library's `drive()`. Its debug `Serial.printf` is left out, because it would mix text into the JSON messages.

## Power and wiring

- **The Quarky's servo/motor port supplies only about 1 A.** Power the motors from a **separate 5 V supply** (≥ 2 A) and connect its ground to the Quarky's **GND**. Share the ground; don't use the Quarky's port for the motor power.
- Motor driver: connect PWM (and direction) inputs as set in the pin table above.
- IR sensors: digital output to the GPIO you found, 3.3 V and GND from the Quarky.

## Flashing: troubleshooting

**The chip isn't detected ("Failed to connect" / "Could not detect the chip")**
- Put the board in download mode by hand: unplug the USB cable, hold **BOOT** (also called IO0 or FLASH), plug the cable in, and keep holding for about 2 seconds. Then click **Choose port & detect chip** again.
- Or, with the cable plugged in: hold **BOOT**, tap **RST / EN** once, then release **BOOT**.
- If the board has no BOOT button, try another USB cable (some are charge-only) and the 115200 speed.

**The port is busy**
- Only one program can use a serial port at a time. Close the Arduino IDE (and its Serial Monitor), Thonny, PuTTY, and any other browser tab using a serial page. The control page closes its own connection before it flashes.
- Unplug and replug the cable, then choose the port again.
- Linux: add your user to the `dialout` group (`sudo usermod -aG dialout $USER`, then log out and in). Windows: check Device Manager for the COM port and install the CH340 or CP210x driver if it's missing.

**A flash failed or stopped half-way**
- Just flash again. The chip's built-in bootloader stays intact, so the board can always be flashed again.
- Use 115200, a better cable, and a USB port directly on the computer.
- If it still fails, enter download mode by hand, tick **Erase all flash first**, and flash again. Erasing also deletes everything else stored on the board.
- If the hash check fails, reload the page with Ctrl+F5 so it fetches the file and manifest again.

**After flashing, the page can't talk to the car**
- Wait a few seconds; the board restarts when its port opens. Use **Reconnect**.
- The console should show a `hello` from `steam-car`. If you flashed the IR sensor finder, it doesn't answer the car page: flash the car firmware again.

## Developing the site

```sh
npm install
npm run dev        # http://localhost:5173
npm run build      # dist/ (the firmware is fetched from GitHub Pages unless public/firmware exists)
```

The site is React with [@lobehub/ui](https://ui.lobehub.com/) v6, a three.js 3D view, and esptool-js 0.7.0 for flashing.

Deploy: GitHub Pages builds and publishes on every push (`.github/workflows/pages.yml`; Settings → Pages → Source: GitHub Actions). Vercel builds the same project with `vercel.json` (`npm run build`), taking the firmware from the Pages site.

## Building the firmware

The site is built and published by `.github/workflows/pages.yml` on every push: it compiles both sketches with arduino-cli 1.3.1 and the ESP32 core 3.3.12, writes `firmware/manifest.json` (version, build time, size, SHA-256, flash offset), and deploys to Pages. To build locally:

```sh
arduino-cli config add board_manager.additional_urls https://espressif.github.io/arduino-esp32/package_esp32_index.json
arduino-cli core update-index && arduino-cli core install esp32:esp32@3.3.12
tools/build_firmware.sh 1.0.0      # writes public/firmware/ and manifest.json
```

Firmware images are written at offset `0x0` as one merged image (bootloader, partition table and application).

## Serial protocol

JSON lines, 115200 baud. The page sends one object per line; the car answers with JSON lines.

| Page → car | Car → page |
|---|---|
| `{"t":"hello"}` | `{"t":"hello","fw","ver","reverse","line","pins":{…}}` |
| `{"t":"cfg","track","slew","base","kp","lost","search","invL","invR","swap","irHigh"}` | `{"t":"ack","what":"cfg","ok":true}` |
| `{"t":"drive","v":50,"w":-20}` (manual only) | `{"t":"status","mode","state","l","r","s":[left,right]}` (every 100 ms) |
| `{"t":"mode","m":"manual"\|"line"}` | `{"t":"ack","what":"mode","ok"}` |
| `{"t":"stop"}` | `{"t":"ack","what":"stop"}` |
| `{"t":"ping","id":n}` | `{"t":"ack","what":"ping","id":n}` |
| | `{"t":"log","msg":"…"}` (e.g. drive timeout) |

## Repository layout

```
src/                             the control page (React, @lobehub/ui, three.js)
public/vendor/esptool-js-0.7.0/  esptool-js 0.7.0 bundle, pinned (see VENDORED.md)
scripts/fetch-firmware.mjs       Vercel builds: fetch the firmware from the Pages site
firmware/steam_car/              car firmware
firmware/ir_sensor_finder/       IR sensor finder
tools/build_firmware.sh          builds both sketches → public/firmware/
tools/make_manifest.py           writes manifest.json (version, size, SHA-256, offsets)
.github/workflows/pages.yml      build + publish on every push
```

The Robotic_ARM (robotic arm) page that used to be here is still in the git history.
