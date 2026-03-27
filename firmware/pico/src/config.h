#pragma once

// --- Stepper pins (TMC2208 STEP/DIR/EN) ---
#define STEPPER_STEP_PIN 2
#define STEPPER_DIR_PIN 3
#define STEPPER_EN_PIN 4

// --- Encoder pins (AMT112S-V quadrature) ---
#define ENCODER_A_PIN 6
#define ENCODER_B_PIN 7

// --- XDA (XD-OEM UART) ---
#define XDA_UART_ID uart1
#define XDA_UART_TX_PIN 8
#define XDA_UART_RX_PIN 9
#define XDA_UART_BAUD 76800

// --- Motion defaults ---
#define STEPPER_DEFAULT_SPEED_STEPS_PER_S 2000.0f
#define STEPPER_DEFAULT_ACCEL_STEPS_PER_S2 8000.0f
#define STEPPER_MIN_STEP_INTERVAL_US 50
#define STEPPER_PULSE_WIDTH_US 2

// --- Status stream ---
#define STATUS_INTERVAL_MS 100
#define LINEAR_MOVE_TIMEOUT_MS 5000
#define LINEAR_IN_POSITION_TOLERANCE_UNITS 50
#define FIRMWARE_VERSION "1.0.0"
