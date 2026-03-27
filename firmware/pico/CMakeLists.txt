cmake_minimum_required(VERSION 3.13)

include(pico_sdk_import.cmake)

project(laserxe_pico C CXX ASM)
set(CMAKE_C_STANDARD 11)
set(CMAKE_CXX_STANDARD 17)

pico_sdk_init()

add_executable(laserxe_pico
  src/main.cpp
  src/stepper.cpp
  src/encoder.cpp
  src/xda.cpp
  src/jsmn.c
)

target_include_directories(laserxe_pico PRIVATE src)

target_link_libraries(laserxe_pico
  pico_stdlib
  hardware_uart
  hardware_gpio
  hardware_timer
)

pico_enable_stdio_usb(laserxe_pico 1)
pico_enable_stdio_uart(laserxe_pico 0)
pico_add_extra_outputs(laserxe_pico)
