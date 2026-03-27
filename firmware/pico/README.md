# LaserXe Pico Firmware

Firmware for Raspberry Pi Pico 2W that bridges:

- USB serial (Pi 5 ↔ Pico)
- Stepper motor via STEP/DIR (TMC2208)
- XLA-1 via XD-OEM controller (UART)
- AMT112S-V encoder (quadrature)

## Build (Pico SDK)

1. Install Pico SDK and toolchain.
2. From `firmware/pico`:

```bash
mkdir build
cd build
cmake ..
make -j
```

3. Flash `laserxe_pico.uf2` to the Pico (BOOTSEL).

## Wiring (default pins)

You can change pins in `src/config.h`.

### USB (Pi ↔ Pico)
- USB-C/USB micro from Pi to Pico (CDC serial).

### Stepper (TMC2208, STEP/DIR)
- STEP: `GPIO2`
- DIR: `GPIO3`
- EN: `GPIO4` (optional, low=enable)

### Encoder (AMT112S-V)
- A: `GPIO6`
- B: `GPIO7`

### XDA (XD-OEM UART)
- UART1 TX: `GPIO8` → XD-OEM RX
- UART1 RX: `GPIO9` ← XD-OEM TX
- GND common

## Serial Protocol (Pi ↔ Pico)

Line-delimited JSON over USB.

Examples:

```
{"type":"move_abs","axis":"linear","target_units":2400}
{"type":"move_abs","axis":"rotation","target_steps":800}
{"type":"home","axis":"linear"}
{"type":"stop","axis":"rotation"}
{"type":"status"}
```

Status stream (Pico → Pi) every 100 ms:

```
{"type":"status","linear_pos_units":1234,"rotation_pos_steps":5678,"linear_moving":true,"rotation_moving":false}
```

## Notes

- Linear units are XDA encoder units (1 mm = 1,000,000 / encoder_resolution_nm).
- Rotation uses step counts; gear ratio is handled in the UI/backend.
- This firmware keeps rotation scaling configurable: it accepts `rotation_steps_per_deg`
  in an optional `config` command for future use.
- Stepper motion uses acceleration ramps (software-based).
- You can also send `stepper_max_speed_steps_per_s` and `stepper_accel_steps_per_s2`
  via the `config` command to tune motion.
