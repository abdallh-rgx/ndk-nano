# hello-jni sample: built by pipeline/run_all.sh in cmake mode with the
# ndk-nano toolchain file (ANDROID_ABI=arm64-v8a, ANDROID_PLATFORM=android-24,
# ANDROID_STL=c++_shared).
cmake_minimum_required(VERSION 3.22)
project(hello-jni C CXX)

add_library(hello-jni SHARED
    jni/main.c
    jni/engine.cpp)

target_link_libraries(hello-jni log)
