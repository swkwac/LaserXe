#include <Arduino.h>

#ifndef LOW
#define LOW 0
#endif
#ifndef HIGH
#define HIGH 1
#endif

#define X_STEP_PIN 2
#define X_DIR_PIN 5
#define X_ENABLE_PIN 8

// ---- CONFIG (mechanism + default motion profile) ----
const int FULL_STEPS_PER_REV = 200;     // 1.8 deg motor
const float STEP_CORRECTION = 1.0f;
const float GEAR_RATIO = 6.60f;         // motor revs per mechanism rev
const bool ENABLE_ACTIVE_LOW = true;    // A4988/DRV8825 on CNC shield => LOW enables driver

// Motion profile parameters (runtime-configurable via serial commands).
// Delay is per half-cycle in stepPulse(): total period per microstep ≈ 2*delay_us.
// Smaller delay => faster.
volatile unsigned int stepDelayMinUs = 800;    // max speed (min delay)
volatile unsigned int stepDelayStartUs = 1600; // start/stop delay (slower)
volatile long rampSteps = 800;                 // accel/decel length (microsteps)
volatile int microstepsConfig = 8;             // must match the driver's actual microstep setting
// -----------------------------------------------

// ---- TELEMETRY ----
bool streamEnabled = true;
unsigned long streamEveryMs = 500;
unsigned long lastStreamMs = 0;
bool movingNow = false;
long currentMotorSteps = 0;  // signed, software-estimated motor microsteps
String lastCmd = "BOOT";
String lastErr = "";
// -------------------

long mechDegreesToMotorSteps(float mechDeg) {
  const float stepsPerRevMotor = (float)FULL_STEPS_PER_REV * (float)microstepsConfig * STEP_CORRECTION;
  const float motorRev = mechDeg * GEAR_RATIO / 360.0f;
  const float steps = motorRev * stepsPerRevMotor;
  if (steps >= 0) return (long)(steps + 0.5f);
  return (long)(steps - 0.5f);
}

float motorStepsToMechDegrees(long motorSteps) {
  const float stepsPerRevMotor = (float)FULL_STEPS_PER_REV * (float)microstepsConfig * STEP_CORRECTION;
  if (stepsPerRevMotor <= 0.0f || GEAR_RATIO <= 0.0f) return 0.0f;
  const float motorRev = (float)motorSteps / stepsPerRevMotor;
  return motorRev * 360.0f / GEAR_RATIO;
}

bool isDriverEnabled() {
  int level = digitalRead(X_ENABLE_PIN);
  return ENABLE_ACTIVE_LOW ? (level == LOW) : (level == HIGH);
}

void setDriverEnabled(bool enabled) {
  int level = enabled
    ? (ENABLE_ACTIVE_LOW ? LOW : HIGH)
    : (ENABLE_ACTIVE_LOW ? HIGH : LOW);
  digitalWrite(X_ENABLE_PIN, level);
}

void stepPulse(unsigned int delayUs) {
  if (delayUs < 20) delayUs = 20;
  digitalWrite(X_STEP_PIN, HIGH);
  delayMicroseconds(delayUs);
  digitalWrite(X_STEP_PIN, LOW);
  delayMicroseconds(delayUs);
}

void printStatus(const char* reason) {
  Serial.print("STAT ");
  Serial.print("reason=");
  Serial.print(reason);
  Serial.print(" enabled=");
  Serial.print(isDriverEnabled() ? 1 : 0);
  Serial.print(" moving=");
  Serial.print(movingNow ? 1 : 0);
  Serial.print(" mech_deg=");
  Serial.print(motorStepsToMechDegrees(currentMotorSteps), 4);
  Serial.print(" motor_steps=");
  Serial.print(currentMotorSteps);
  Serial.print(" ustep=");
  Serial.print(microstepsConfig);
  Serial.print(" start_us=");
  Serial.print(stepDelayStartUs);
  Serial.print(" min_us=");
  Serial.print(stepDelayMinUs);
  Serial.print(" ramp_steps=");
  Serial.print(rampSteps);
  Serial.print(" stream=");
  Serial.print(streamEnabled ? 1 : 0);
  Serial.print(" stream_ms=");
  Serial.print(streamEveryMs);
  Serial.print(" uptime_ms=");
  Serial.print(millis());
  Serial.print(" last_cmd=");
  Serial.print(lastCmd);
  if (lastErr.length() > 0) {
    Serial.print(" last_err=");
    Serial.print(lastErr);
  }
  Serial.println();
}

void moveMechanismDegrees(float mechDeg) {
  long deltaSteps = mechDegreesToMotorSteps(mechDeg);
  if (deltaSteps == 0) return;
  if (!isDriverEnabled()) {
    lastErr = "driver_disabled";
    return;
  }

  movingNow = true;
  unsigned int startUs = stepDelayStartUs;
  unsigned int minUs = stepDelayMinUs;
  if (startUs < 100) startUs = 100;
  if (minUs < 50) minUs = 50;
  if (minUs > startUs) minUs = startUs;
  if (deltaSteps > 0) {
    digitalWrite(X_DIR_PIN, HIGH);  // CW
  } else {
    digitalWrite(X_DIR_PIN, LOW);   // CCW
    deltaSteps = -deltaSteps;
  }

  long total = deltaSteps;
  long r = rampSteps;
  if (r < 0) r = 0;
  // Limit ramp to half the move (triangle profile when move is short).
  if (r * 2 > total) r = total / 2;

  for (long i = 0; i < total; i++) {
    unsigned int d = minUs;
    if (r > 0) {
      if (i < r) {
        // Accel: startUs -> minUs
        float t = (float)i / (float)r;
        d = (unsigned int)((float)startUs + ((float)minUs - (float)startUs) * t);
      } else if (i >= (total - r)) {
        // Decel: minUs -> startUs
        float t = (float)(i - (total - r)) / (float)r;
        d = (unsigned int)((float)minUs + ((float)startUs - (float)minUs) * t);
      }
    }
    // Inline step pulse with current delay.
    digitalWrite(X_STEP_PIN, HIGH);
    delayMicroseconds(d);
    digitalWrite(X_STEP_PIN, LOW);
    delayMicroseconds(d);
  }

  // Signed tracking by requested sign.
  long signedDelta = mechDegreesToMotorSteps(mechDeg);
  currentMotorSteps += signedDelta;
  movingNow = false;
}

String readLine() {
  static String line;
  while (Serial.available()) {
    char c = (char)Serial.read();
    if (c == '\n') {
      String out = line;
      line = "";
      out.trim();
      return out;
    }
    if (c == '\r') continue;
    line += c;
    if (line.length() > 120) line.remove(0);
  }
  return "";
}

void printHelp() {
  Serial.println("CMDS: CW<n>, CCW<n>, MOVE=<signed_deg>, HOME, ZERO, STAT?, CFG?,");
  Serial.println("      STARTUS=<us>, MINUS=<us>, RAMP=<steps>, USTEP=<1|2|4|8|16>,");
  Serial.println("      PING, STREAM=0/1, RATE=<ms>, EN=0/1, HELP");
}

void setup() {
  pinMode(X_STEP_PIN, OUTPUT);
  pinMode(X_DIR_PIN, OUTPUT);
  pinMode(X_ENABLE_PIN, OUTPUT);

  setDriverEnabled(true);
  digitalWrite(X_STEP_PIN, LOW);

  Serial.begin(115200);
  delay(20);
  Serial.println("READY ROTATION_STEP_DIR");
  printHelp();
  printStatus("boot");
}

void loop() {
  if (streamEnabled) {
    unsigned long now = millis();
    if (now - lastStreamMs >= streamEveryMs) {
      lastStreamMs = now;
      printStatus("stream");
    }
  }

  String cmd = readLine();
  if (!cmd.length()) return;

  cmd.trim();
  cmd.toUpperCase();
  lastCmd = cmd;
  lastErr = "";

  if (cmd == "PING") {
    Serial.println("PONG");
    return;
  }

  if (cmd == "HELP") {
    printHelp();
    return;
  }

  if (cmd == "STAT" || cmd == "STAT?") {
    printStatus("request");
    return;
  }

  if (cmd == "CFG" || cmd == "CFG?") {
    Serial.print("CFG start_us=");
    Serial.print(stepDelayStartUs);
    Serial.print(" min_us=");
    Serial.print(stepDelayMinUs);
    Serial.print(" ramp_steps=");
    Serial.print(rampSteps);
    Serial.print(" ustep=");
    Serial.print(microstepsConfig);
    Serial.println();
    Serial.println("OK CFG");
    return;
  }

  if (cmd == "ZERO") {
    currentMotorSteps = 0;
    Serial.println("OK ZERO");
    printStatus("zero");
    return;
  }

  if (cmd == "HOME") {
    float backToZero = -motorStepsToMechDegrees(currentMotorSteps);
    moveMechanismDegrees(backToZero);
    Serial.println("OK HOME");
    printStatus("home");
    return;
  }

  if (cmd.startsWith("EN=")) {
    int v = cmd.substring(3).toInt();
    if (v == 0 || v == 1) {
      setDriverEnabled(v == 1);
      Serial.println("OK EN");
      printStatus("en");
    } else {
      lastErr = "en_range";
      Serial.println("ERR");
    }
    return;
  }

  if (cmd.startsWith("STREAM=")) {
    int v = cmd.substring(7).toInt();
    if (v == 0 || v == 1) {
      streamEnabled = (v == 1);
      Serial.println("OK STREAM");
      printStatus("stream_cfg");
    } else {
      lastErr = "stream_range";
      Serial.println("ERR");
    }
    return;
  }

  if (cmd.startsWith("RATE=")) {
    long v = cmd.substring(5).toInt();
    if (v >= 100 && v <= 10000) {
      streamEveryMs = (unsigned long)v;
      Serial.println("OK RATE");
      printStatus("rate");
    } else {
      lastErr = "rate_range";
      Serial.println("ERR");
    }
    return;
  }

  if (cmd.startsWith("STARTUS=")) {
    long v = cmd.substring(8).toInt();
    if (v >= 50 && v <= 20000) {
      stepDelayStartUs = (unsigned int)v;
      if (stepDelayMinUs > stepDelayStartUs) stepDelayMinUs = stepDelayStartUs;
      Serial.println("OK STARTUS");
      printStatus("profile");
    } else {
      lastErr = "startus_range";
      Serial.println("ERR");
    }
    return;
  }

  if (cmd.startsWith("MINUS=")) {
    long v = cmd.substring(6).toInt();
    if (v >= 20 && v <= 20000) {
      stepDelayMinUs = (unsigned int)v;
      if (stepDelayMinUs > stepDelayStartUs) stepDelayStartUs = stepDelayMinUs;
      Serial.println("OK MINUS");
      printStatus("profile");
    } else {
      lastErr = "minus_range";
      Serial.println("ERR");
    }
    return;
  }

  if (cmd.startsWith("RAMP=")) {
    long v = cmd.substring(5).toInt();
    if (v >= 0 && v <= 2000000) {
      rampSteps = v;
      Serial.println("OK RAMP");
      printStatus("profile");
    } else {
      lastErr = "ramp_range";
      Serial.println("ERR");
    }
    return;
  }

  if (cmd.startsWith("USTEP=")) {
    long v = cmd.substring(6).toInt();
    if (v == 1 || v == 2 || v == 4 || v == 8 || v == 16) {
      microstepsConfig = (int)v;
      Serial.println("OK USTEP");
      printStatus("profile");
    } else {
      lastErr = "ustep_range";
      Serial.println("ERR");
    }
    return;
  }

  if (cmd.startsWith("MOVE=")) {
    float deg = cmd.substring(5).toFloat();
    if (deg < -3600.0f || deg > 3600.0f || deg == 0.0f) {
      lastErr = "move_range_or_zero";
      Serial.println("ERR");
      return;
    }
    moveMechanismDegrees(deg);
    Serial.println("OK MOVE");
    printStatus("move");
    return;
  }

  // Legacy compatibility with existing backend commands:
  // CCW<deg> / CW<deg>, deg in 1..360.
  if (cmd.startsWith("CCW")) {
    int mechDeg = cmd.substring(3).toInt();
    if (mechDeg > 0 && mechDeg <= 360) {
      moveMechanismDegrees(-(float)mechDeg);
      Serial.println("OK");
      printStatus("ccw");
    } else {
      lastErr = "ccw_range";
      Serial.println("ERR");
    }
    return;
  }

  if (cmd.startsWith("CW")) {
    int mechDeg = cmd.substring(2).toInt();
    if (mechDeg > 0 && mechDeg <= 360) {
      moveMechanismDegrees((float)mechDeg);
      Serial.println("OK");
      printStatus("cw");
    } else {
      lastErr = "cw_range";
      Serial.println("ERR");
    }
    return;
  }

  lastErr = "unknown_cmd";
  Serial.println("ERR");
}
