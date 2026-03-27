#include "xda.h"

#include <stdio.h>
#include <string.h>

#include "hardware/uart.h"
#include "pico/stdlib.h"

#include "config.h"

XdaController::XdaController()
    : axis_('X'), baud_(XDA_UART_BAUD), last_pos_units_(0), rx_len_(0) {}

void XdaController::init() {
  uart_init(XDA_UART_ID, baud_);
  gpio_set_function(XDA_UART_TX_PIN, GPIO_FUNC_UART);
  gpio_set_function(XDA_UART_RX_PIN, GPIO_FUNC_UART);
  uart_set_format(XDA_UART_ID, 8, 1, UART_PARITY_NONE);
  uart_set_fifo_enabled(XDA_UART_ID, false);
}

void XdaController::set_axis(char axis) {
  if (axis >= 'A' && axis <= 'Z') axis_ = axis;
}

void XdaController::set_baud(uint32_t baud) {
  baud_ = baud;
  uart_init(XDA_UART_ID, baud_);
}

void XdaController::send_home() { send_axis_command("HOME"); }
void XdaController::send_index() { send_command("INDX"); }
void XdaController::send_stop() { send_axis_command("STOP"); }

void XdaController::send_speed(int32_t speed_units) {
  char buf[32];
  snprintf(buf, sizeof(buf), "SSPD=%ld", (long)speed_units);
  send_axis_command(buf);
}

void XdaController::send_move_abs(int32_t units) {
  char buf[32];
  snprintf(buf, sizeof(buf), "DPOS=%ld", (long)units);
  send_axis_command(buf);
}

void XdaController::send_move_rel(int32_t units) {
  char buf[32];
  snprintf(buf, sizeof(buf), "STEP=%ld", (long)units);
  send_axis_command(buf);
}

void XdaController::request_position() {
  send_axis_command("EPOS=?");
}

int32_t XdaController::last_position_units() const { return last_pos_units_; }

void XdaController::send_command(const char *cmd) {
  uart_puts(XDA_UART_ID, cmd);
  uart_puts(XDA_UART_ID, "\n");
}

void XdaController::send_axis_command(const char *cmd) {
  char buf[40];
  snprintf(buf, sizeof(buf), "%c:%s", axis_, cmd);
  send_command(buf);
}

bool XdaController::poll() {
  bool updated = false;
  while (uart_is_readable(XDA_UART_ID)) {
    char c = uart_getc(XDA_UART_ID);
    if (c == '\r') continue;
    if (c == '\n') {
      rx_buffer_[rx_len_] = '\0';
      if (rx_len_ > 0) {
        handle_line(rx_buffer_);
        updated = true;
      }
      rx_len_ = 0;
    } else if (rx_len_ < (int)sizeof(rx_buffer_) - 1) {
      rx_buffer_[rx_len_++] = c;
    }
  }
  return updated;
}

void XdaController::handle_line(const char *line) {
  const char *pos = strstr(line, "EPOS=");
  if (!pos) return;
  pos += 5;
  long value = strtol(pos, nullptr, 10);
  last_pos_units_ = (int32_t)value;
}
