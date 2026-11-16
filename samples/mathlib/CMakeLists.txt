# mathlib sample: built by pipeline/run_all.sh in cmake mode with the
# ndk-nano toolchain file (ANDROID_ABI=arm64-v8a, ANDROID_PLATFORM=android-24).
cmake_minimum_required(VERSION 3.22)
project(mathlib C)

add_library(mathx SHARED
    src/mathx.c)

target_link_libraries(mathx m)
