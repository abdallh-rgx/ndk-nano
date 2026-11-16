#!/usr/bin/env bash
# mathlib sample: direct clang build used by pipeline/run_all.sh when
# cmake/ninja are not available.
#
# Env / متغيرات البيئة:
#   NDK_TREE  the ndk-nano tree (default: <repo>/dist/ndk-nano)
#   OUT_DIR   output directory   (default: <this sample>/out)
#
# The .o file is kept in $OUT_DIR on purpose: run_all.sh extracts the
# undefined link symbols from it (llvm-nm) to build data/usage.json.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

NDK_TREE="${NDK_TREE:-$REPO_ROOT/dist/ndk-nano}"
OUT_DIR="${OUT_DIR:-$SCRIPT_DIR/out}"

BIN="$NDK_TREE/toolchains/llvm/prebuilt/linux-x86_64/bin"
CC="$BIN/clang"

if [ ! -x "$CC" ]; then
  echo "ERROR: clang not found at $CC (NDK_TREE=$NDK_TREE)" >&2
  exit 1
fi

TARGET="--target=aarch64-linux-android24"

mkdir -p "$OUT_DIR"

"$CC" $TARGET -fPIC -O2 -c "$SCRIPT_DIR/src/mathx.c" -o "$OUT_DIR/mathx.o"
"$CC" $TARGET -shared -o "$OUT_DIR/libmathx.so" "$OUT_DIR/mathx.o" -lm
