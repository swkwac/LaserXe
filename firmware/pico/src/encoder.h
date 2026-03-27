#pragma once

#include <stdint.h>

class QuadratureEncoder {
 public:
  QuadratureEncoder(uint pin_a, uint pin_b);
  void init();
  int32_t get_count() const;
  void reset(int32_t value = 0);

 private:
  static void gpio_callback(uint gpio, uint32_t events);
  void handle_gpio();

  uint pin_a_;
  uint pin_b_;
  volatile int32_t count_;
  volatile uint8_t prev_state_;
};
