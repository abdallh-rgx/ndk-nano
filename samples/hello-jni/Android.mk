# hello-jni sample: ndk-build module (arm64-v8a only).
# Build from this directory with: <ndk-nano-tree>/ndk-build
# (or: loader/ndk-nano ndk-build)

APP_ABI := arm64-v8a
APP_STL := c++_shared

LOCAL_PATH := $(call my-dir)

include $(CLEAR_VARS)
LOCAL_MODULE := hello-jni
LOCAL_SRC_FILES := jni/main.c jni/engine.cpp
LOCAL_LDLIBS := -llog
include $(BUILD_SHARED_LIBRARY)
