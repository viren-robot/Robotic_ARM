/*
  STEAM_CAR IR sensor finder for the STEMpedia Quarky (ESP32).

  Finds which GPIO pins the line sensors are wired to. It guesses nothing: it just prints what every
  candidate pin reads, and tells you when a pin changes.

  How to use (Serial Monitor or the STEAM_CAR page's console, 115200 baud):
    1. Put the car on a light surface with a dark line (or hold a dark object under the sensors).
    2. Watch the "CHANGED" lines. Move a sensor from the surface onto the line and back.
       The pin that changes every time is that sensor's pin. Do the other sensor too.
    3. Write the two pin numbers in IR_LEFT_PIN / IR_RIGHT_PIN at the top of steam_car.ino
       (the sensor on the car's left, and the one on its right), then flash steam_car again.
    4. Also look at "level": which reading (0 or 1) the pin gives over the line. If the line reads 0,
       tick "Sensor reads 1 over the line" off in the website's Line follow settings.

  Pins that are NOT tested: 0, 1, 2, 3, 6-12, 16, 17 (boot, USB serial, flash memory and the motors).
  Other parts of the Quarky (buttons, display, buzzer) may also change a pin: only a pin that reacts
  to the sensor itself, and to nothing else, is the one.
*/

#include <Arduino.h>

const int PINS[] = { 4, 5, 13, 14, 15, 18, 19, 21, 22, 23, 25, 26, 27, 32, 33, 34, 35, 36, 39 };
const int N = sizeof PINS / sizeof PINS[0];

int lastDigital[N];
int lastAnalog[N];
unsigned long lastTable = 0;

void setup() {
  Serial.begin(115200);
  delay(500);
  for (int i = 0; i < N; i++) {
    pinMode(PINS[i], INPUT);
    lastDigital[i] = digitalRead(PINS[i]);
    lastAnalog[i] = analogRead(PINS[i]);
  }
  Serial.println("STEAM_CAR IR sensor finder. Move a sensor over the line and back; watch for CHANGED lines.");
  Serial.println("pin: digital / analog (0-4095)");
}

void loop() {
  for (int i = 0; i < N; i++) {
    int d = digitalRead(PINS[i]);
    int a = analogRead(PINS[i]);
    if (d != lastDigital[i]) {
      Serial.printf("CHANGED  GPIO %d: %d -> %d   (analog %d)\n", PINS[i], lastDigital[i], d, a);
      lastDigital[i] = d;
    } else if (abs(a - lastAnalog[i]) > 800) {
      Serial.printf("analog   GPIO %d: %d -> %d\n", PINS[i], lastAnalog[i], a);
    }
    lastAnalog[i] = a;
  }
  if (millis() - lastTable >= 1000) {                       // a full table once a second
    lastTable = millis();
    Serial.print("readings:");
    for (int i = 0; i < N; i++) Serial.printf(" %d=%d/%d", PINS[i], lastDigital[i], lastAnalog[i]);
    Serial.println();
  }
  delay(20);
}
