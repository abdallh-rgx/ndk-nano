# mathlib sample: ndk-build module (arm64-v8a only).
# Build from this directory with: <ndk-nano-tree>/ndk-build
# (or: loader/ndk-nano ndk-build)

APP_ABI := arm64-v8a

LOCAL_PATH := $(call my-dir)

include $(CLEAR_VARS)
LOCAL_MODULE := mathx
LOCAL_SRC_FILES := src/mathx.c
LOCAL_LDLIBS := -lm
include $(BUILD_SHARED_LIBRARY)
