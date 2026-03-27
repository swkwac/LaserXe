#pragma once

#include <stdint.h>

class XdaController {
 public:
  XdaController();
  void init();

  void set_axis(char axis);
  void set_baud(uint32_t baud);

  void send_home();
  void send_index();
  void send_stop();
  void send_speed(int32_t speed_units);
  void send_move_abs(int32_t units);
  void send_move_rel(int32_t units);
  void request_position();

  bool poll();
  int32_t last_position_units() const;

 private:
  void send_command(const char *cmd);
  void send_axis_command(const char *cmd);
  void handle_line(const char *line);

  char axis_;
  uint32_t baud_;
  int32_t last_pos_units_;
  char rx_buffer_[64];
  int rx_len_;
};
