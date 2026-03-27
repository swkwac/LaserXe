#include <cstdio>
#include <cstdlib>
#include <cstring>

#include "hardware/gpio.h"
#include "pico/stdlib.h"
#include "pico/time.h"

#include "config.h"
#include "encoder.h"
#include "jsmn.h"
#include "stepper.h"
#include "xda.h"

struct RuntimeConfig {
  float linear_units_per_mm = 800.0f;          // 1e6 / 1250 nm
  float rotation_steps_per_deg = 1.0f;         // configurable
  char linear_axis = 'X';
  float stepper_max_speed = STEPPER_DEFAULT_SPEED_STEPS_PER_S;
  float stepper_accel = STEPPER_DEFAULT_ACCEL_STEPS_PER_S2;
  int32_t linear_tolerance_units = LINEAR_IN_POSITION_TOLERANCE_UNITS;
  uint32_t linear_timeout_ms = LINEAR_MOVE_TIMEOUT_MS;
  uint32_t encoder_correction_threshold = 0;   // 0 = disabled
  int32_t linear_max_speed_units = 10000;
  int32_t encoder_cpr = 4096;
};

struct JogState {
  bool linear_active = false;
  bool rotation_active = false;
  int32_t linear_direction = 0;   // +1 or -1
  int32_t rotation_direction = 0; // +1 or -1
};

struct LinearState {
  int32_t target_units = 0;
  int32_t position_units = 0;
  bool moving = false;
  absolute_time_t deadline = {0};
};

struct RotationState {
  int32_t target_steps = 0;
  bool moving = false;
};

struct Waypoint {
  int32_t linear_units = 0;
  int32_t rotation_steps = 0;
  uint32_t dwell_ms = 0;
};

struct PatternRunner {
  bool active = false;
  bool in_dwell = false;
  uint32_t count = 0;
  uint32_t index = 0;
  absolute_time_t dwell_until = {0};
  Waypoint points[64]{};
};

static bool json_token_streq(const char *json, const jsmntok_t &tok, const char *s) {
  int len = tok.end - tok.start;
  return tok.type == JSMN_STRING && (int)strlen(s) == len && strncmp(json + tok.start, s, len) == 0;
}

static int json_skip(const jsmntok_t *tokens, int idx) {
  int to_visit = 0;
  if (tokens[idx].type == JSMN_OBJECT) {
    to_visit = tokens[idx].size * 2;
  } else if (tokens[idx].type == JSMN_ARRAY) {
    to_visit = tokens[idx].size;
  }
  int i = idx + 1;
  while (to_visit > 0) {
    if (tokens[i].type == JSMN_OBJECT) {
      to_visit += tokens[i].size * 2;
    } else if (tokens[i].type == JSMN_ARRAY) {
      to_visit += tokens[i].size;
    }
    i++;
    to_visit--;
  }
  return i;
}

static int json_find_key(const char *json, const jsmntok_t *tokens, int obj_idx, const char *key) {
  if (tokens[obj_idx].type != JSMN_OBJECT) return -1;
  int i = obj_idx + 1;
  for (int pair = 0; pair < tokens[obj_idx].size; pair++) {
    if (json_token_streq(json, tokens[i], key)) return i + 1;
    i = json_skip(tokens, i + 1);
  }
  return -1;
}

static bool json_get_string(const char *json, const jsmntok_t *tokens, int idx, char *out, size_t out_len) {
  if (idx < 0) return false;
  if (tokens[idx].type != JSMN_STRING) return false;
  int len = tokens[idx].end - tokens[idx].start;
  if (len <= 0 || (size_t)len >= out_len) return false;
  memcpy(out, json + tokens[idx].start, len);
  out[len] = '\0';
  return true;
}

static bool json_get_int(const char *json, const jsmntok_t *tokens, int idx, int32_t *out) {
  if (idx < 0) return false;
  if (tokens[idx].type != JSMN_PRIMITIVE) return false;
  char buf[32];
  int len = tokens[idx].end - tokens[idx].start;
  if (len <= 0 || len >= (int)sizeof(buf)) return false;
  memcpy(buf, json + tokens[idx].start, len);
  buf[len] = '\0';
  *out = (int32_t)strtol(buf, nullptr, 10);
  return true;
}

static bool json_get_float(const char *json, const jsmntok_t *tokens, int idx, float *out) {
  if (idx < 0) return false;
  if (tokens[idx].type != JSMN_PRIMITIVE) return false;
  char buf[32];
  int len = tokens[idx].end - tokens[idx].start;
  if (len <= 0 || len >= (int)sizeof(buf)) return false;
  memcpy(buf, json + tokens[idx].start, len);
  buf[len] = '\0';
  *out = strtof(buf, nullptr);
  return true;
}

static void send_error(const char *message) {
  printf("{\"type\":\"error\",\"message\":\"%s\"}\n", message);
}

static void send_status(const LinearState &linear, const RotationState &rotation, int32_t rotation_steps, int32_t encoder_counts) {
  printf(
      "{\"type\":\"status\",\"fw\":\"%s\",\"linear_pos_units\":%ld,\"rotation_pos_steps\":%ld,"
      "\"linear_target_units\":%ld,\"rotation_target_steps\":%ld,"
      "\"linear_moving\":%s,\"rotation_moving\":%s,\"rotation_encoder_counts\":%ld}\n",
      FIRMWARE_VERSION,
      (long)linear.position_units,
      (long)rotation_steps,
      (long)linear.target_units,
      (long)rotation.target_steps,
      linear.moving ? "true" : "false",
      rotation.moving ? "true" : "false",
      (long)encoder_counts);
}

static bool linear_in_position(const LinearState &linear, int32_t tolerance_units) {
  int32_t diff = linear.position_units - linear.target_units;
  if (diff < 0) diff = -diff;
  if (diff <= tolerance_units) return true;
  if (absolute_time_diff_us(get_absolute_time(), linear.deadline) <= 0) return true;
  return false;
}

static void start_waypoint(const Waypoint &pt, RuntimeConfig &cfg, LinearState &linear, RotationState &rotation,
                           StepperMotor &stepper, XdaController &xda) {
  linear.target_units = pt.linear_units;
  linear.moving = true;
  linear.deadline = delayed_by_ms(get_absolute_time(), cfg.linear_timeout_ms);
  xda.set_axis(cfg.linear_axis);
  xda.send_move_abs(pt.linear_units);

  rotation.target_steps = pt.rotation_steps;
  stepper.move_to(pt.rotation_steps);
  rotation.moving = true;
}

int main() {
  stdio_init_all();

  RuntimeConfig config;
  LinearState linear;
  RotationState rotation;
  PatternRunner pattern;

  StepperMotor stepper(STEPPER_STEP_PIN, STEPPER_DIR_PIN, STEPPER_EN_PIN);
  QuadratureEncoder encoder(ENCODER_A_PIN, ENCODER_B_PIN);
  XdaController xda;
  JogState jog;

  stepper.init();
  encoder.init();
  xda.init();

  absolute_time_t last_status = get_absolute_time();
  absolute_time_t last_xda_query = get_absolute_time();
  absolute_time_t last_jog_linear = get_absolute_time();

  #define INPUT_BUF_SIZE 3072
  static char input_buf[INPUT_BUF_SIZE];
  int input_len = 0;

  while (true) {
    int ch = getchar_timeout_us(0);
    if (ch != PICO_ERROR_TIMEOUT) {
      if (ch == '\n') {
        input_buf[input_len] = '\0';
        input_len = 0;

        jsmn_parser parser;
        jsmn_init(&parser);
        jsmntok_t tokens[64];
        int r = jsmn_parse(&parser, input_buf, strlen(input_buf), tokens, 64);
        if (r > 0 && tokens[0].type == JSMN_OBJECT) {
          char type[24];
          int type_idx = json_find_key(input_buf, tokens, 0, "type");
          if (!json_get_string(input_buf, tokens, type_idx, type, sizeof(type))) {
            send_error("missing type");
            continue;
          }

          if (strcmp(type, "config") == 0) {
            int idx = json_find_key(input_buf, tokens, 0, "rotation_steps_per_deg");
            float rot = 0.0f;
            if (json_get_float(input_buf, tokens, idx, &rot) && rot > 0.0f) {
              config.rotation_steps_per_deg = rot;
            }
            idx = json_find_key(input_buf, tokens, 0, "linear_units_per_mm");
            float lin = 0.0f;
            if (json_get_float(input_buf, tokens, idx, &lin) && lin > 0.0f) {
              config.linear_units_per_mm = lin;
            }
            idx = json_find_key(input_buf, tokens, 0, "stepper_max_speed_steps_per_s");
            float max_speed = 0.0f;
            if (json_get_float(input_buf, tokens, idx, &max_speed) && max_speed > 0.0f) {
              config.stepper_max_speed = max_speed;
              stepper.set_speed_steps_per_s(max_speed);
            }
            idx = json_find_key(input_buf, tokens, 0, "stepper_accel_steps_per_s2");
            float accel = 0.0f;
            if (json_get_float(input_buf, tokens, idx, &accel) && accel > 0.0f) {
              config.stepper_accel = accel;
              stepper.set_accel_steps_per_s2(accel);
            }
            idx = json_find_key(input_buf, tokens, 0, "linear_axis");
            char axis[4];
            if (json_get_string(input_buf, tokens, idx, axis, sizeof(axis))) {
              config.linear_axis = axis[0];
              xda.set_axis(config.linear_axis);
            }
            int32_t tol = 0;
            idx = json_find_key(input_buf, tokens, 0, "linear_tolerance_units");
            if (json_get_int(input_buf, tokens, idx, &tol) && tol >= 0) {
              config.linear_tolerance_units = tol;
            }
            int32_t to_ms = 0;
            idx = json_find_key(input_buf, tokens, 0, "linear_timeout_ms");
            if (json_get_int(input_buf, tokens, idx, &to_ms) && to_ms > 0) {
              config.linear_timeout_ms = (uint32_t)to_ms;
            }
            int32_t enc_thr = -1;
            idx = json_find_key(input_buf, tokens, 0, "encoder_correction_threshold");
            if (json_get_int(input_buf, tokens, idx, &enc_thr) && enc_thr >= 0) {
              config.encoder_correction_threshold = (uint32_t)enc_thr;
            }
            int32_t enc_cpr = 0;
            idx = json_find_key(input_buf, tokens, 0, "encoder_cpr");
            if (json_get_int(input_buf, tokens, idx, &enc_cpr) && enc_cpr > 0) {
              config.encoder_cpr = enc_cpr;
            }
            int32_t lin_speed = 0;
            idx = json_find_key(input_buf, tokens, 0, "linear_max_speed_units");
            if (json_get_int(input_buf, tokens, idx, &lin_speed) && lin_speed > 0) {
              config.linear_max_speed_units = lin_speed;
              xda.set_axis(config.linear_axis);
              xda.send_speed(config.linear_max_speed_units);
            }
          } else if (strcmp(type, "emergency_stop") == 0) {
            pattern.active = false;
            pattern.in_dwell = false;
            jog.linear_active = false;
            jog.rotation_active = false;
            xda.send_stop();
            stepper.stop();
            linear.moving = false;
          } else if (strcmp(type, "jog") == 0) {
            char axis[16];
            int axis_idx = json_find_key(input_buf, tokens, 0, "axis");
            if (!json_get_string(input_buf, tokens, axis_idx, axis, sizeof(axis))) {
              send_error("missing axis");
              continue;
            }
            int32_t dir = 0;
            int idx = json_find_key(input_buf, tokens, 0, "direction");
            json_get_int(input_buf, tokens, idx, &dir);
            if (dir > 0) dir = 1;
            else if (dir < 0) dir = -1;
            if (strcmp(axis, "linear") == 0) {
              jog.linear_active = true;
              jog.linear_direction = dir;
            } else if (strcmp(axis, "rotation") == 0) {
              jog.rotation_active = true;
              jog.rotation_direction = dir;
            }
          } else if (strcmp(type, "jog_stop") == 0) {
            char axis[16];
            int axis_idx = json_find_key(input_buf, tokens, 0, "axis");
            if (json_get_string(input_buf, tokens, axis_idx, axis, sizeof(axis))) {
              if (strcmp(axis, "linear") == 0) jog.linear_active = false;
              else if (strcmp(axis, "rotation") == 0) jog.rotation_active = false;
            } else {
              jog.linear_active = false;
              jog.rotation_active = false;
            }
            if (!jog.linear_active) xda.send_stop();
            if (!jog.rotation_active) stepper.stop();
          } else if (strcmp(type, "move_abs") == 0 || strcmp(type, "move_rel") == 0) {
            char axis[16];
            int axis_idx = json_find_key(input_buf, tokens, 0, "axis");
            if (!json_get_string(input_buf, tokens, axis_idx, axis, sizeof(axis))) {
              send_error("missing axis");
              continue;
            }

            bool is_abs = strcmp(type, "move_abs") == 0;
            if (strcmp(axis, "linear") == 0) {
              int32_t target_units = 0;
              int idx = json_find_key(input_buf, tokens, 0, "target_units");
              if (!json_get_int(input_buf, tokens, idx, &target_units)) {
                float value = 0.0f;
                idx = json_find_key(input_buf, tokens, 0, "value");
                json_get_float(input_buf, tokens, idx, &value);
                target_units = (int32_t)(value * config.linear_units_per_mm);
              }
              if (is_abs) {
                xda.send_move_abs(target_units);
                linear.target_units = target_units;
              } else {
                xda.send_move_rel(target_units);
                linear.target_units += target_units;
              }
              linear.moving = true;
              linear.deadline = delayed_by_ms(get_absolute_time(), config.linear_timeout_ms);
            } else if (strcmp(axis, "rotation") == 0) {
              int32_t target_steps = 0;
              int idx = json_find_key(input_buf, tokens, 0, "target_steps");
              if (!json_get_int(input_buf, tokens, idx, &target_steps)) {
                float value = 0.0f;
                idx = json_find_key(input_buf, tokens, 0, "value");
                json_get_float(input_buf, tokens, idx, &value);
                target_steps = (int32_t)(value * config.rotation_steps_per_deg);
              }
              if (is_abs) {
                stepper.move_to(target_steps);
              } else {
                stepper.move_by(target_steps);
              }
              rotation.target_steps = stepper.target_steps();
            }
          } else if (strcmp(type, "home") == 0) {
            char axis[16];
            int axis_idx = json_find_key(input_buf, tokens, 0, "axis");
            if (!json_get_string(input_buf, tokens, axis_idx, axis, sizeof(axis))) {
              send_error("missing axis");
              continue;
            }
            if (strcmp(axis, "linear") == 0) {
              xda.send_index();
              xda.send_home();
              linear.target_units = 0;
              linear.moving = true;
              linear.deadline = delayed_by_ms(get_absolute_time(), config.linear_timeout_ms);
            } else if (strcmp(axis, "rotation") == 0) {
              stepper.stop();
              stepper.reset_position(0);
              rotation.target_steps = 0;
            }
          } else if (strcmp(type, "stop") == 0) {
            char axis[16];
            int axis_idx = json_find_key(input_buf, tokens, 0, "axis");
            if (!json_get_string(input_buf, tokens, axis_idx, axis, sizeof(axis))) {
              send_error("missing axis");
              continue;
            }
            if (strcmp(axis, "linear") == 0) {
              xda.send_stop();
              linear.moving = false;
            } else if (strcmp(axis, "rotation") == 0) {
              stepper.stop();
            }
          } else if (strcmp(type, "pattern_start") == 0) {
            int pattern_idx = json_find_key(input_buf, tokens, 0, "pattern");
            if (pattern_idx >= 0 && tokens[pattern_idx].type == JSMN_ARRAY) {
              pattern.count = 0;
              int i = pattern_idx + 1;
              for (int item = 0; item < tokens[pattern_idx].size && pattern.count < 64; item++) {
                if (tokens[i].type != JSMN_OBJECT) {
                  i = json_skip(tokens, i);
                  continue;
                }
                Waypoint wp{};
                int key_idx = json_find_key(input_buf, tokens, i, "linear_units");
                if (!json_get_int(input_buf, tokens, key_idx, &wp.linear_units)) {
                  float value = 0.0f;
                  key_idx = json_find_key(input_buf, tokens, i, "linear_mm");
                  if (json_get_float(input_buf, tokens, key_idx, &value)) {
                    wp.linear_units = (int32_t)(value * config.linear_units_per_mm);
                  }
                }
                key_idx = json_find_key(input_buf, tokens, i, "rotation_steps");
                if (!json_get_int(input_buf, tokens, key_idx, &wp.rotation_steps)) {
                  float value = 0.0f;
                  key_idx = json_find_key(input_buf, tokens, i, "rotation_deg");
                  if (json_get_float(input_buf, tokens, key_idx, &value)) {
                    wp.rotation_steps = (int32_t)(value * config.rotation_steps_per_deg);
                  }
                }
                int32_t dwell = 0;
                key_idx = json_find_key(input_buf, tokens, i, "dwell_ms");
                if (json_get_int(input_buf, tokens, key_idx, &dwell)) {
                  wp.dwell_ms = (uint32_t)dwell;
                }
                pattern.points[pattern.count++] = wp;
                i = json_skip(tokens, i);
              }
              pattern.index = 0;
              pattern.active = pattern.count > 0;
              pattern.in_dwell = false;
              if (pattern.active) {
                start_waypoint(pattern.points[0], config, linear, rotation, stepper, xda);
              }
            }
          } else if (strcmp(type, "pattern_cancel") == 0) {
            pattern.active = false;
            pattern.in_dwell = false;
            xda.send_stop();
            stepper.stop();
          } else if (strcmp(type, "status") == 0) {
            rotation.moving = stepper.is_moving();
            linear.position_units = xda.last_position_units();
            send_status(linear, rotation, stepper.current_steps(), encoder.get_count());
          }
        }
      } else if (ch != '\r') {
        if (input_len < INPUT_BUF_SIZE - 1) {
          input_buf[input_len++] = (char)ch;
        }
      }
    }

    if (jog.rotation_active) {
      stepper.move_by(jog.rotation_direction);
    }
    if (jog.linear_active && absolute_time_diff_us(last_jog_linear, get_absolute_time()) > 20000) {
      int32_t step = jog.linear_direction * 100;
      xda.send_move_rel(step);
      last_jog_linear = get_absolute_time();
    }

    stepper.update();

    if (xda.poll()) {
      linear.position_units = xda.last_position_units();
    }

    if (absolute_time_diff_us(last_xda_query, get_absolute_time()) > 150000) {
      xda.request_position();
      last_xda_query = get_absolute_time();
    }

    rotation.moving = stepper.is_moving();

    if (config.encoder_correction_threshold > 0 && !rotation.moving && !jog.rotation_active) {
      int32_t enc = encoder.get_count();
      float steps_per_count = (360.0f * config.rotation_steps_per_deg) / (float)config.encoder_cpr;
      int32_t encoder_step_equiv = (int32_t)(enc * steps_per_count);
      int32_t diff = stepper.current_steps() - encoder_step_equiv;
      if (diff < 0) diff = -diff;
      if (diff > (int32_t)config.encoder_correction_threshold) {
        int32_t nudge = encoder_step_equiv - stepper.current_steps();
        if (nudge > 0) stepper.move_by(1);
        else if (nudge < 0) stepper.move_by(-1);
      }
    }

    if (linear.moving && linear_in_position(linear, config.linear_tolerance_units)) {
      linear.moving = false;
    }

    if (pattern.active) {
      if (pattern.in_dwell) {
        if (absolute_time_diff_us(get_absolute_time(), pattern.dwell_until) <= 0) {
          pattern.in_dwell = false;
          pattern.index++;
          if (pattern.index >= pattern.count) {
            pattern.active = false;
          } else {
            start_waypoint(pattern.points[pattern.index], config, linear, rotation, stepper, xda);
          }
        }
      } else {
        bool done = !rotation.moving && !linear.moving;
        if (done) {
          uint32_t dwell = pattern.points[pattern.index].dwell_ms;
          if (dwell > 0) {
            pattern.in_dwell = true;
            pattern.dwell_until = delayed_by_ms(get_absolute_time(), dwell);
          } else {
            pattern.index++;
            if (pattern.index >= pattern.count) {
              pattern.active = false;
            } else {
              start_waypoint(pattern.points[pattern.index], config, linear, rotation, stepper, xda);
            }
          }
        }
      }
    }

    if (absolute_time_diff_us(last_status, get_absolute_time()) > STATUS_INTERVAL_MS * 1000) {
      send_status(linear, rotation, stepper.current_steps(), encoder.get_count());
      last_status = get_absolute_time();
    }

    sleep_ms(1);
  }
  return 0;
}
