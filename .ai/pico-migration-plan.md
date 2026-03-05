## Motion system: from simulation UI to Raspberry Pi 5 + Pico prototype

This document captures the high-level plan for moving the current two-motor (rotational + linear) **simulation** into a **physical prototype** controlled by a Raspberry Pi 5 and Raspberry Pi Pico.

### Layers / architecture

- **Frontend (UI)**: existing Astro/React app (LaserXe), sends motion requests.
- **Controller (Raspberry Pi 5)**: runs Python API, talks HTTP/WebSocket to UI and serial to Pico.
- **Motor driver (Raspberry Pi Pico)**: runs MicroPython firmware, talks to motor drivers (step/dir) and limit switches.

### Phase 1 – Stabilize and isolate simulation logic

1. **Extract motion API in Python**
   - Create a dedicated Python module for motion commands: `move_linear(mm)`, `move_rotate(deg)`, `move_both(mm, deg)`, `home()`, `stop()`, `status()`.
   - Keep it *pure* (no hardware), only computing positions/velocities/timelines.

2. **Define shared command model**
   - Agree on a small set of commands:
     - `HOME`
     - `MOVE_LINEAR(distance_mm, speed_mm_s)`
     - `MOVE_ROTATE(angle_deg, speed_deg_s)`
     - `MOVE_BOTH(distance_mm, angle_deg, speed)`
     - `STOP`
     - `STATUS`
   - Serialize as JSON per line, e.g.
     - `{"cmd": "MOVE_LINEAR", "distance_mm": 10.0, "speed_mm_s": 5.0}`

3. **Hardware abstraction layer**
   - Define `HardwareInterface` with methods above.
   - Implement:
     - `SimulatedHardwareInterface` – current simulator only.
     - `SerialHardwareInterface` – later: sends commands to Pico over serial.

### Phase 2 – Hardware selection and wiring

4. **Select motors and drivers**
   - Rotational axis: stepper (e.g. NEMA 17) + driver (A4988/TMC2208/etc.).
   - Linear axis: linear actuator or stepper + leadscrew.
   - Decide supply voltage (likely 12–24 V for motors, 5 V for logic).

5. **Electronics topology**
   - One main motor supply sized for both motors (+ margin).
   - 5 V supply or buck converter for Pico and Pi (clean power).
   - Pico GPIO → driver STEP, DIR, ENABLE pins for each motor.
   - Limit / home switches wired to Pico GPIO with pull-ups.

6. **Wiring documentation**
   - Draw a simple schematic:
     - Power rails, fuses.
     - Pico → drivers → motors.
     - Switches → Pico.

### Phase 3 – Pico firmware (motor control brain)

7. **Language choice**
   - Use **MicroPython** on Pico (closest to normal Python).

8. **Command interpreter on Pico**
   - Pico listens on USB serial/UART.
   - Main loop:
     - Read line → parse JSON → dispatch on `cmd`.
   - Implement handlers:
     - `handle_home()`, `handle_move_linear()`, `handle_move_rotate()`, `handle_move_both()`, `handle_stop()`, `handle_status()`.

9. **Basic motion control**
   - Convert distances/angles to **steps**:
     - `steps = distance_mm * steps_per_mm`.
     - `steps = angle_deg * steps_per_deg`.
   - Simple blocking step loops:
     - Toggle STEP pin with `sleep_us(...)` delays for speed control.
   - Maintain in-RAM state: positions, homed flag, last error.

10. **Safety & homing**
    - Implement `HOME`:
      - Approach limit switch slowly, back off, set position = 0.
    - During moves:
      - Monitor limit switches; abort and report error if triggered unexpectedly.
      - Honor `STOP` command by breaking motion loops on a flag.

11. **Direct PC debug**
    - Connect Pico to laptop over USB.
    - Use serial terminal or small Python script to:
      - Send commands.
      - Verify directions, homing, stops, and error messages.

### Phase 4 – Raspberry Pi 5 (bridge between UI and Pico)

12. **Pi setup**
    - Install Raspberry Pi OS, Python, and libraries (`fastapi`/`flask`, `pyserial`).
    - Enable serial/USB and confirm Pico appears as `/dev/ttyACM0` (or similar).

13. **Pico client on Pi**
    - Python module that:
      - Opens serial port.
      - Sends JSON lines.
      - Reads responses with timeouts.
    - Exposes functions matching the motion API: `move_linear`, `move_rotate`, `home`, `stop`, `status`.

14. **REST/WebSocket API on Pi**
    - HTTP API (FastAPI/Flask) that wraps Pico client:
      - `POST /motion/move_linear`
      - `POST /motion/move_rotate`
      - `POST /motion/move_both`
      - `POST /motion/home`
      - `POST /motion/stop`
      - `GET /motion/status`
    - Optional WebSocket for live status streaming.

15. **Logging and health**
    - Log each command and result to a file.
    - `GET /health` endpoint that checks Pico connectivity (e.g. `PING`).

### Phase 5 – Connect existing UI

16. **Simulation vs hardware mode**
    - Backend exposes same HTTP API for UI in both modes.
    - Config flag/environment switch:
      - `mode = "simulation"` → use `SimulatedHardwareInterface`.
      - `mode = "hardware"` → use `SerialHardwareInterface` (Pi + Pico).

17. **Point UI to Pi**
    - In Astro/React app:
      - Dev: API base URL → `http://localhost:...` (simulation).
      - Physical prototype: API base URL → `http://<pi-ip>:...` (hardware).

18. **Status display in UI**
    - Show:
      - Current positions.
      - Homed/not homed.
      - Error messages from Pico.
    - Poll `GET /motion/status` or subscribe via WebSocket.

### Phase 6 – Calibration, tuning, safety validation

19. **Calibration**
    - Measure:
      - Steps per revolution.
      - Leadscrew pitch (mm per rev).
    - Compute:
      - `steps_per_mm`, `steps_per_deg`.
    - Adjust constants until requested vs. actual travel match.

20. **Motion tuning**
    - Start with low speeds, simple constant-velocity moves.
    - Add basic acceleration/deceleration ramps.
    - Monitor motor temperature and current draw; adjust driver current.

21. **Safety tests**
    - Test:
      - Hitting limit switches during moves.
      - Emergency `STOP`.
      - Pico disconnects / serial failure.
    - Verify:
      - Motors stop safely on any error.
      - UI clearly shows unsafe/error states.

### Phase 7 – Future improvements

22. **Config persistence**
    - Store calibration, limits, and motion parameters in config on Pi (and/or Pico flash).

23. **Advanced features (later)**
    - Queued/non-blocking moves and trajectories.
    - More complex kinematics if mechanics evolve.
    - User management and permissions around motion control UI.

