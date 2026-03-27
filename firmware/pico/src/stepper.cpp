#include "stepper.h"

#include "hardware/gpio.h"
#include "pico/stdlib.h"

#include "config.h"

StepperMotor::StepperMotor(uint step_pin, uint dir_pin, uint en_pin)
    : step_pin_(step_pin),
      dir_pin_(dir_pin),
      en_pin_(en_pin),
      steps_per_s_(STEPPER_DEFAULT_SPEED_STEPS_PER_S),
      accel_steps_per_s2_(STEPPER_DEFAULT_ACCEL_STEPS_PER_S2),
      current_speed_(0.0f),
      next_step_time_(nil_time),
      last_update_time_(nil_time),
      current_steps_(0),
      target_steps_(0),
      moving_(false) {}

void StepperMotor::init() {
  gpio_init(step_pin_);
  gpio_set_dir(step_pin_, GPIO_OUT);
  gpio_put(step_pin_, 0);

  gpio_init(dir_pin_);
  gpio_set_dir(dir_pin_, GPIO_OUT);
  gpio_put(dir_pin_, 0);

  gpio_init(en_pin_);
  gpio_set_dir(en_pin_, GPIO_OUT);
  gpio_put(en_pin_, 0);

  set_speed_steps_per_s(steps_per_s_);
  set_accel_steps_per_s2(accel_steps_per_s2_);
}

void StepperMotor::set_speed_steps_per_s(float steps_per_s) {
  if (steps_per_s < 1.0f) steps_per_s = 1.0f;
  steps_per_s_ = steps_per_s;
}

void StepperMotor::set_accel_steps_per_s2(float accel) {
  if (accel < 1.0f) accel = 1.0f;
  accel_steps_per_s2_ = accel;
}

void StepperMotor::move_to(int32_t target_steps) {
  target_steps_ = target_steps;
  if (target_steps_ == current_steps_) {
    moving_ = false;
    current_speed_ = 0.0f;
    next_step_time_ = nil_time;
    return;
  }
  moving_ = true;
  next_step_time_ = nil_time;
}

void StepperMotor::move_by(int32_t delta_steps) { move_to(current_steps_ + delta_steps); }

void StepperMotor::stop() {
  moving_ = false;
  current_speed_ = 0.0f;
  next_step_time_ = nil_time;
}

void StepperMotor::reset_position(int32_t value) {
  current_steps_ = value;
  target_steps_ = value;
  current_speed_ = 0.0f;
  next_step_time_ = nil_time;
}

void StepperMotor::reset_step_timer() {
  next_step_time_ = nil_time;
}

int32_t StepperMotor::current_steps() const { return current_steps_; }
int32_t StepperMotor::target_steps() const { return target_steps_; }
bool StepperMotor::is_moving() const { return moving_; }

void StepperMotor::step_once() {
  if (!moving_) return;
  if (target_steps_ == current_steps_) {
    moving_ = false;
    return;
  }
  const bool dir = target_steps_ > current_steps_;
  gpio_put(dir_pin_, dir ? 1 : 0);
  gpio_put(step_pin_, 1);
  sleep_us(STEPPER_PULSE_WIDTH_US);
  gpio_put(step_pin_, 0);
  current_steps_ += dir ? 1 : -1;
  if (current_steps_ == target_steps_) {
    moving_ = false;
  }
}

void StepperMotor::update() {
  absolute_time_t now = get_absolute_time();
  float dt_s = 0.001f;
  if (!is_nil_time(last_update_time_)) {
    int64_t dt_us = absolute_time_diff_us(last_update_time_, now);
    if (dt_us > 0) dt_s = static_cast<float>(dt_us) / 1000000.0f;
  }
  last_update_time_ = now;

  if (!moving_) return;

  int32_t remaining = target_steps_ - current_steps_;
  if (remaining == 0) {
    moving_ = false;
    current_speed_ = 0.0f;
    return;
  }

  float distance = static_cast<float>(abs(remaining));
  float decel_dist = (current_speed_ * current_speed_) / (2.0f * accel_steps_per_s2_);
  if (distance <= decel_dist) {
    current_speed_ -= accel_steps_per_s2_ * dt_s;
    if (current_speed_ < 10.0f) current_speed_ = 10.0f;
  } else if (current_speed_ < steps_per_s_) {
    current_speed_ += accel_steps_per_s2_ * dt_s;
    if (current_speed_ > steps_per_s_) current_speed_ = steps_per_s_;
  }

  if (current_speed_ <= 0.0f) current_speed_ = 10.0f;
  int64_t interval_us = (int64_t)(1000000.0f / current_speed_);
  if (interval_us < STEPPER_MIN_STEP_INTERVAL_US) interval_us = STEPPER_MIN_STEP_INTERVAL_US;

  if (is_nil_time(next_step_time_)) {
    next_step_time_ = now;
  }
  if (absolute_time_diff_us(now, next_step_time_) <= 0) {
    step_once();
    next_step_time_ = delayed_by_us(now, interval_us);
  }
}
