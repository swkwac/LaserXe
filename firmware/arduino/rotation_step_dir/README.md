# Rotation Step/Dir Arduino Sketch

Sketch file: `rotation_step_dir.ino`

## Supported serial commands (115200 baud)

- `CW<deg>` / `CCW<deg>` where `deg` is `1..360` (compatible with existing LaserXe backend)
- `STAT?` - print status line
- `PING` - returns `PONG`
- `ZERO` - set current software position as `0`
- `HOME` - go to software home (`0`)
- `EN=1` / `EN=0` - enable/disable stepper driver output
- `STREAM=1` / `STREAM=0` - periodic status lines on/off
- `RATE=<ms>` - stream period (`100..10000`)
- `MOVE=<signed_deg>` - direct relative move, supports larger values

Status lines look like:

`STAT reason=stream enabled=1 moving=0 mech_deg=12.3456 motor_steps=12345 stream=1 stream_ms=500 uptime_ms=123456 last_cmd=CW90`

## Flashing with Arduino IDE

1. Open `rotation_step_dir.ino`.
2. Board: your Arduino model (e.g. Uno).
3. Port: your COM port (e.g. `COM20`).
4. Upload.
5. Open Serial Monitor at `115200`, line ending `Newline`.

## Flashing with arduino-cli (optional)

Example for Uno:

```bash
arduino-cli compile --fqbn arduino:avr:uno firmware/arduino/rotation_step_dir
arduino-cli upload -p COM20 --fqbn arduino:avr:uno firmware/arduino/rotation_step_dir
```
