#include "encoder.h"

#include "hardware/gpio.h"

static QuadratureEncoder *g_encoder = nullptr;

static const int8_t QUAD_TABLE[16] = {
    0, -1, 1, 0,
    1, 0, 0, -1,
    -1, 0, 0, 1,
    0, 1, -1, 0,
};

QuadratureEncoder::QuadratureEncoder(uint pin_a, uint pin_b)
    : pin_a_(pin_a), pin_b_(pin_b), count_(0), prev_state_(0) {}

void QuadratureEncoder::init() {
  gpio_init(pin_a_);
  gpio_init(pin_b_);
  gpio_set_dir(pin_a_, GPIO_IN);
  gpio_set_dir(pin_b_, GPIO_IN);
  gpio_pull_up(pin_a_);
  gpio_pull_up(pin_b_);

  uint a = gpio_get(pin_a_);
  uint b = gpio_get(pin_b_);
  prev_state_ = (a << 1) | b;

  g_encoder = this;
  gpio_set_irq_enabled_with_callback(pin_a_, GPIO_IRQ_EDGE_RISE | GPIO_IRQ_EDGE_FALL, true, &gpio_callback);
  gpio_set_irq_enabled(pin_b_, GPIO_IRQ_EDGE_RISE | GPIO_IRQ_EDGE_FALL, true);
}

int32_t QuadratureEncoder::get_count() const { return count_; }

void QuadratureEncoder::reset(int32_t value) {
  count_ = value;
}

void QuadratureEncoder::gpio_callback(uint gpio, uint32_t events) {
  if (g_encoder) {
    g_encoder->handle_gpio();
  }
}

void QuadratureEncoder::handle_gpio() {
  uint a = gpio_get(pin_a_);
  uint b = gpio_get(pin_b_);
  uint8_t state = (a << 1) | b;
  uint8_t index = (prev_state_ << 2) | state;
  count_ += QUAD_TABLE[index];
  prev_state_ = state;
}
