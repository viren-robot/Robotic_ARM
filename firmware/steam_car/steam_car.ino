/*
  STEAM_CAR firmware for the STEMpedia Quarky (ESP32), two-wheeled differential-drive car.

  Talks to the STEAM_CAR control website over USB serial (115200 baud), one JSON message per line.
  Page -> car:  {"t":"hello"}  {"t":"cfg",...}  {"t":"drive","v":50,"w":-20}  {"t":"mode","m":"manual"|"line"}
                {"t":"stop"}   {"t":"ping","id":1}
  Car -> page:  {"t":"hello",...}  {"t":"ack","what":"..."}  {"t":"log","msg":"..."}  {"t":"status",...}

  v = forward speed (-100..100 %), w = turn rate (-100..100 %, positive = turn left / counter-clockwise).
    left  = v - w*T/2        right = v + w*T/2        (T = track width; 1 % of w = 1 % of wheel speed per 50 mm of half-track)
  If either wheel would exceed 100 %, both are scaled by the same factor.

  Safety on the car itself:
    - no drive command for 400 ms in manual mode -> the motors stop
    - in line-follow mode the page must keep pinging (every 0.5 s); silence for 2 s -> the motors stop
    - STOP is immediate (no ramp). All other speed changes are slew-limited.

  MOTOR DRIVING is the code of QuarkyCarControl::drive() from the Robot-car library, unchanged except that
  (a) its debug Serial.printf() is removed, because it would corrupt the JSON lines, and
  (b) the direction pins use the library's documented onDrive() pattern. Without direction pins the motors
      cannot reverse: negative wheel speeds are limited to 0.
*/

#include <Arduino.h>

// ======================= PINS: edit these (or pass -DNAME=value when building) =======================
#ifndef LEFT_PWM_PIN
#define LEFT_PWM_PIN    16   // Motor L (speed)
#endif
#ifndef RIGHT_PWM_PIN
#define RIGHT_PWM_PIN   17   // Motor R (speed)
#endif
#ifndef LEFT_DIR_PIN
#define LEFT_DIR_PIN    -1   // Motor L direction pin. -1 = unknown / none: no reverse
#endif
#ifndef RIGHT_DIR_PIN
#define RIGHT_DIR_PIN   -1   // Motor R direction pin. -1 = unknown / none: no reverse
#endif
#ifndef IR_LEFT_PIN
#define IR_LEFT_PIN     -1   // Left line sensor.  -1 = unknown: line follow disabled. Find it with ir_sensor_finder.
#endif
#ifndef IR_RIGHT_PIN
#define IR_RIGHT_PIN    -1   // Right line sensor. -1 = unknown: line follow disabled.
#endif
// =================================================================

#if __has_include("fw_version.h")
#include "fw_version.h"            // written by tools/build_firmware.sh
#else
#define FW_VERSION "dev"
#endif
#define FW_NAME "steam-car"

#define HAS_REVERSE (LEFT_DIR_PIN >= 0 && RIGHT_DIR_PIN >= 0)
#define HAS_SENSORS (IR_LEFT_PIN >= 0 && IR_RIGHT_PIN >= 0)
#define DRIVE_TIMEOUT_MS 400
#define LINK_TIMEOUT_MS  2000
#define HALF_TRACK_REF   50.0f     // mm: w = 1 % changes each wheel by 1 % per 50 mm of half-track

struct Cfg {
  float track = 100;        // mm
  float slew = 400;         // % of full speed per second
  float base = 45;          // line follow base speed, %
  float kp = 40;            // line follow turn gain, % of w per unit error
  bool lostSearch = false;  // false = stop when the line is lost, true = turn to look for it
  float searchSpeed = 35;   // % wheel speed while searching
  bool invL = false, invR = false, swap = false;
  bool lineLevelHigh = true; // sensor reads HIGH when it is over the line
} cfg;

enum Mode { MANUAL, LINE };
Mode mode = MANUAL;
float tgtL = 0, tgtR = 0;    // wanted wheel speeds, % (after invert / swap), what the motors should do
float curL = 0, curR = 0;    // wheel speeds now, % (slew-limited)
float driveV = 0, driveW = 0;
unsigned long lastDriveAt = 0, lastRxAt = 0, lastStep = 0, lastStatus = 0, lostSince = 0;
bool timedOut = false;
int lastSide = 0;            // -1 line was last seen on the left, +1 on the right
const char *state = "idle";
char line[256];
size_t len = 0;
bool overflow = false;

// ---------------- motors (QuarkyCarControl::drive(), see the note at the top) ----------------
void drive(float left, float right) {
  left  = constrain(left,  -1.0f, 1.0f);
  right = constrain(right, -1.0f, 1.0f);
  if (!HAS_REVERSE) { left = max(left, 0.0f); right = max(right, 0.0f); }   // single-pin motors only go forward
  if (LEFT_DIR_PIN  >= 0) digitalWrite(LEFT_DIR_PIN,  left  < 0 ? HIGH : LOW);
  if (RIGHT_DIR_PIN >= 0) digitalWrite(RIGHT_DIR_PIN, right < 0 ? HIGH : LOW);
  int leftPWM  = (int)(fabs(left)  * 255);
  int rightPWM = (int)(fabs(right) * 255);
  analogWrite(LEFT_PWM_PIN,  leftPWM);
  analogWrite(RIGHT_PWM_PIN, rightPWM);
}

// ---------------- mixing: (v, w) -> wheel speeds, % ----------------
void mix(float v, float w, float &l, float &r) {
  float k = (cfg.track / 2.0f) / HALF_TRACK_REF;
  l = v - w * k;
  r = v + w * k;
  float m = max(fabs(l), fabs(r));
  if (m > 100.0f) { l *= 100.0f / m; r *= 100.0f / m; }           // same factor for both
}

void setWheels(float l, float r) {                                  // logical left/right -> physical motors
  if (cfg.swap) { float t = l; l = r; r = t; }
  if (cfg.invL) l = -l;
  if (cfg.invR) r = -r;
  if (!HAS_REVERSE) { l = max(l, 0.0f); r = max(r, 0.0f); }
  tgtL = l; tgtR = r;
}

void stopNow() {                                                    // immediate, no ramp
  tgtL = tgtR = curL = curR = 0;
  driveV = driveW = 0;
  drive(0, 0);
}

// ---------------- tiny JSON readers (the page sends compact JSON) ----------------
const char *field(const char *s, const char *key) {
  char pat[24];
  snprintf(pat, sizeof pat, "\"%s\":", key);
  const char *p = strstr(s, pat);
  return p ? p + strlen(pat) : nullptr;
}
bool str(const char *s, const char *key, char *out, size_t n) {
  const char *p = field(s, key);
  if (!p || *p != '"') return false;
  p++;
  size_t i = 0;
  while (*p && *p != '"' && i + 1 < n) out[i++] = *p++;
  out[i] = 0;
  return true;
}
bool num(const char *s, const char *key, float &v) {
  const char *p = field(s, key);
  if (!p) return false;
  char *e;
  float x = strtof(p, &e);
  if (e == p) return false;
  v = x;
  return true;
}
bool flagVal(const char *s, const char *key, bool &v) {
  const char *p = field(s, key);
  if (!p) return false;
  if (!strncmp(p, "true", 4)) { v = true; return true; }
  if (!strncmp(p, "false", 5)) { v = false; return true; }
  return false;
}

// ---------------- messages to the page ----------------
void sendHello() {
  Serial.printf("{\"t\":\"hello\",\"fw\":\"%s\",\"ver\":\"%s\",\"reverse\":%s,\"line\":%s,\"pins\":{\"lp\":%d,\"rp\":%d,\"ld\":%d,\"rd\":%d,\"il\":%d,\"ir\":%d}}\n",
                FW_NAME, FW_VERSION, HAS_REVERSE ? "true" : "false", HAS_SENSORS ? "true" : "false",
                LEFT_PWM_PIN, RIGHT_PWM_PIN, LEFT_DIR_PIN, RIGHT_DIR_PIN, IR_LEFT_PIN, IR_RIGHT_PIN);
}
void sendLog(const char *msg) { Serial.printf("{\"t\":\"log\",\"msg\":\"%s\"}\n", msg); }
void sendAck(const char *what, bool ok = true) { Serial.printf("{\"t\":\"ack\",\"what\":\"%s\",\"ok\":%s}\n", what, ok ? "true" : "false"); }

bool sensor(int pin) { return (digitalRead(pin) == HIGH) == cfg.lineLevelHigh; }   // true = over the line

void sendStatus() {
  char s[24] = "null";
  if (HAS_SENSORS) snprintf(s, sizeof s, "[%d,%d]", sensor(IR_LEFT_PIN) ? 1 : 0, sensor(IR_RIGHT_PIN) ? 1 : 0);
  Serial.printf("{\"t\":\"status\",\"mode\":\"%s\",\"state\":\"%s\",\"l\":%.0f,\"r\":%.0f,\"s\":%s}\n",
                mode == LINE ? "line" : "manual", state, curL, curR, s);
}

// ---------------- commands ----------------
void setMode(Mode m) {
  if (m == mode) return;
  stopNow();
  mode = m;
  lostSince = 0;
  timedOut = false;
  state = m == LINE ? "following" : "idle";
}

void handleLine(const char *s) {
  char t[12];
  if (!str(s, "t", t, sizeof t)) return;
  lastRxAt = millis();
  if (!strcmp(t, "drive")) {
    float v = 0, w = 0;
    num(s, "v", v); num(s, "w", w);
    if (mode != MANUAL) return;                                      // line follow ignores manual drive
    driveV = constrain(v, -100.0f, 100.0f);
    driveW = constrain(w, -100.0f, 100.0f);
    float l, r;
    mix(driveV, driveW, l, r);
    setWheels(l, r);
    lastDriveAt = lastRxAt;
    timedOut = false;
    state = (l == 0 && r == 0) ? "idle" : "driving";
  } else if (!strcmp(t, "stop")) {
    stopNow();
    mode = MANUAL;
    state = "stopped";
    sendAck("stop");
  } else if (!strcmp(t, "mode")) {
    char m[12] = "";
    str(s, "m", m, sizeof m);
    if (!strcmp(m, "line")) {
      if (!HAS_SENSORS) { sendLog("line follow unavailable: IR_LEFT_PIN / IR_RIGHT_PIN are not set in the firmware"); sendAck("mode", false); return; }
      setMode(LINE);
    } else setMode(MANUAL);
    sendAck("mode");
  } else if (!strcmp(t, "cfg")) {
    float x; bool b; char lost[10];
    if (num(s, "track", x) && x >= 20 && x <= 500) cfg.track = x;
    if (num(s, "slew", x) && x >= 20 && x <= 5000) cfg.slew = x;
    if (num(s, "base", x)) cfg.base = constrain(x, 0.0f, 100.0f);
    if (num(s, "kp", x)) cfg.kp = constrain(x, 0.0f, 300.0f);
    if (num(s, "search", x)) cfg.searchSpeed = constrain(x, 0.0f, 100.0f);
    if (str(s, "lost", lost, sizeof lost)) cfg.lostSearch = !strcmp(lost, "search");
    if (flagVal(s, "invL", b)) cfg.invL = b;
    if (flagVal(s, "invR", b)) cfg.invR = b;
    if (flagVal(s, "swap", b)) cfg.swap = b;
    if (flagVal(s, "irHigh", b)) cfg.lineLevelHigh = b;
    if (mode == MANUAL) { float l, r; mix(driveV, driveW, l, r); setWheels(l, r); }   // new track / invert apply at once
    sendAck("cfg");
  } else if (!strcmp(t, "ping")) {
    float id = 0;
    num(s, "id", id);
    Serial.printf("{\"t\":\"ack\",\"what\":\"ping\",\"id\":%.0f}\n", id);
  } else if (!strcmp(t, "hello")) {
    sendHello();
  } else {
    sendLog("unknown command");
  }
}

// ---------------- line following ----------------
void followLine() {
  bool l = sensor(IR_LEFT_PIN), r = sensor(IR_RIGHT_PIN);
  float wl, wr;
  if (l || r) {
    lostSince = 0;
    int e = (r ? 1 : 0) - (l ? 1 : 0);                               // +1 line on the right, -1 on the left, 0 both / centred
    if (e) lastSide = e;
    mix(cfg.base, -cfg.kp * e, wl, wr);                              // line on the right -> turn right (w < 0)
    state = e == 0 ? "following" : (e > 0 ? "steer-right" : "steer-left");
  } else {
    if (!lostSince) lostSince = millis();
    if (cfg.lostSearch && millis() - lostSince < 5000) {
      float s = cfg.searchSpeed, dir = lastSide >= 0 ? 1.0f : -1.0f;  // spin towards where the line was last seen
      mix(0, -dir * s * HALF_TRACK_REF / (cfg.track / 2.0f), wl, wr);
      state = "searching";
    } else {
      wl = wr = 0;
      state = "lost";
    }
  }
  setWheels(wl, wr);
}

// ---------------- main loop ----------------
void step() {
  unsigned long now = millis();
  float dt = (now - lastStep) / 1000.0f;
  if (dt > 0.1f) dt = 0.1f;
  lastStep = now;

  if (mode == MANUAL && lastDriveAt && !timedOut && now - lastDriveAt > DRIVE_TIMEOUT_MS) {
    timedOut = true;                                                // no drive command for 400 ms: stop
    stopNow();
    state = "timeout";
    sendLog("no drive command for 400 ms - stopped");
  }
  if (mode == LINE) {
    if (now - lastRxAt > LINK_TIMEOUT_MS) { stopNow(); mode = MANUAL; state = "timeout"; sendLog("lost contact with the page - stopped"); }
    else followLine();
  }

  float d = cfg.slew * dt;                                          // slew limit
  curL += constrain(tgtL - curL, -d, d);
  curR += constrain(tgtR - curR, -d, d);
  drive(curL / 100.0f, curR / 100.0f);
}

void setup() {
  Serial.begin(115200);
  if (LEFT_DIR_PIN  >= 0) pinMode(LEFT_DIR_PIN,  OUTPUT);
  if (RIGHT_DIR_PIN >= 0) pinMode(RIGHT_DIR_PIN, OUTPUT);
  pinMode(LEFT_PWM_PIN,  OUTPUT);
  pinMode(RIGHT_PWM_PIN, OUTPUT);
  if (HAS_SENSORS) { pinMode(IR_LEFT_PIN, INPUT); pinMode(IR_RIGHT_PIN, INPUT); }
  stopNow();
  lastStep = millis();
  sendHello();                                                      // tells the page we (re)started: it sends its settings again
}

void loop() {
  while (Serial.available()) {
    char ch = Serial.read();
    if (ch == '\n') {
      line[len] = 0;
      if (len && !overflow) handleLine(line);
      len = 0; overflow = false;
    } else if (ch != '\r') {
      if (len < sizeof line - 1) line[len++] = ch; else overflow = true;
    }
  }
  if (millis() - lastStep >= 10) step();
  if (millis() - lastStatus >= 100) { lastStatus = millis(); sendStatus(); }
}
