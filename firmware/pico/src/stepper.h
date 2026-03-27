#pragma once

#include <stdint.h>

#include "pico/time.h"

class StepperMotor {
 public:
  StepperMotor(uint step_pin, uint dir_pin, uint en_pin);
  void init();

  void set_speed_steps_per_s(float steps_per_s);
  void set_accel_steps_per_s2(float accel);
  void move_to(int32_t target_steps);
  void move_by(int32_t delta_steps);
  void stop();
  void reset_position(int32_t value = 0);
  void reset_step_timer();
  void update();

  int32_t current_steps() const;
  int32_t target_steps() const;
  bool is_moving() const;

 private:
  void step_once();

  uint step_pin_;
  uint dir_pin_;
  uint en_pin_;

  float steps_per_s_;
  float accel_steps_per_s2_;
  float current_speed_;
  absolute_time_t next_step_time_;
  absolute_time_t last_update_time_;

  volatile int32_t current_steps_;
  volatile int32_t target_steps_;
  volatile bool moving_;
};
