#!/usr/bin/env bash
# hello-jni sample: direct clang build used by pipeline/run_all.sh when
# cmake/ninja are not available.
#
# Env / متغيرات البيئة:
#   NDK_TREE  the ndk-nano tree (default: <repo>/dist/ndk-nano)
#   OUT_DIR   output directory   (default: <this sample>/out)
#
# The .o files are kept in $OUT_DIR on purpose: run_all.sh extracts the
# undefined link symbols from them (llvm-nm) to build data/usage.json.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

NDK_TREE="${NDK_TREE:-$REPO_ROOT/dist/ndk-nano}"
OUT_DIR="${OUT_DIR:-$SCRIPT_DIR/out}"

BIN="$NDK_TREE/toolchains/llvm/prebuilt/linux-x86_64/bin"
CC="$BIN/clang"
CXX="$BIN/clang++"

if [ ! -x "$CC" ]; then
  echo "ERROR: clang not found at $CC (NDK_TREE=$NDK_TREE)" >&2
  exit 1
fi

TARGET="--target=aarch64-linux-android24"

mkdir -p "$OUT_DIR"

"$CC" $TARGET -fPIC -O2 -c "$SCRIPT_DIR/jni/main.c" -o "$OUT_DIR/main.o"
"$CXX" $TARGET -std=c++17 -fPIC -O2 -c "$SCRIPT_DIR/jni/engine.cpp" \
    -o "$OUT_DIR/engine.o"

"$CXX" $TARGET -shared -o "$OUT_DIR/libhello-jni.so" \
    "$OUT_DIR/main.o" "$OUT_DIR/engine.o" -llog
