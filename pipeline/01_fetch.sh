#!/usr/bin/env bash
# Stage 1: fetch the Android NDK zip and extract it into work/ndk.
#
# Behavior:
#   - If work/ndk already exists: skip (idempotent).
#   - If work/ndk.zip exists but work/ndk does not: unzip it.
#   - Otherwise download with curl (resumable), sanity-check the size,
#     extract, rename to work/ndk, then DELETE the zip to save disk
#     (its byte size is recorded first in work/meta.json).
set -euo pipefail

NDK_VERSION="${NDK_VERSION:-r27c}"
PIPE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK="$PIPE_ROOT/work"
ZIP="$WORK/ndk.zip"
EXTRACT_DIR="$WORK/android-ndk-${NDK_VERSION}"
URL="https://dl.google.com/android/repository/android-ndk-${NDK_VERSION}-linux.zip"

log() { echo "[fetch] $*"; }
die() { echo "[fetch] ERROR: $*" >&2; exit 1; }

mkdir -p "$WORK"

new_zip_bytes=""

if [ -d "$WORK/ndk" ]; then
  log "work/ndk already exists; skipping download and extraction"
else
  if [ ! -f "$ZIP" ]; then
    log "downloading $URL"
    curl -fL --retry 3 -C - -o "$ZIP" "$URL"
  else
    log "reusing existing $ZIP"
  fi

  zip_bytes="$(stat -c %s "$ZIP")"
  if [ "$zip_bytes" -lt 104857600 ]; then
    die "zip is only ${zip_bytes} bytes (< 100MB); download looks truncated or wrong"
  fi
  log "zip size: ${zip_bytes} bytes"

  log "unzipping into $WORK"
  unzip -q "$ZIP" -d "$WORK"

  if [ ! -d "$EXTRACT_DIR" ]; then
    die "expected extracted directory $EXTRACT_DIR not found"
  fi

  rm -rf "$WORK/ndk"
  mv "$EXTRACT_DIR" "$WORK/ndk"
  log "renamed $EXTRACT_DIR -> $WORK/ndk"

  # Record the zip size before deleting it: the orchestrator only needs the
  # number, keeping the 633MB file around would waste disk space.
  new_zip_bytes="$zip_bytes"
  rm -f "$ZIP"
  log "deleted $ZIP after successful extraction (size recorded)"
fi

# Always (re)write work/meta.json; keep a previously recorded zip size when
# the download step was skipped.
python3 - "$WORK" "$NDK_VERSION" "$new_zip_bytes" <<'PYEOF'
import json
import os
import subprocess
import sys

work, version, new_zip = sys.argv[1], sys.argv[2], sys.argv[3]
meta_path = os.path.join(work, "meta.json")
old = {}
if os.path.exists(meta_path):
    try:
        with open(meta_path) as fh:
            old = json.load(fh)
    except Exception:
        old = {}

extracted = None
ndk_dir = os.path.join(work, "ndk")
if os.path.isdir(ndk_dir):
    try:
        out = subprocess.run(["du", "-sb", ndk_dir], capture_output=True,
                             text=True, check=True).stdout
        extracted = int(out.split()[0])
    except Exception:
        extracted = None

if new_zip.isdigit():
    zip_bytes = int(new_zip)
elif isinstance(old.get("zip_bytes"), int):
    zip_bytes = old["zip_bytes"]
else:
    zip_bytes = None

meta = {"ndk_version": version, "zip_bytes": zip_bytes,
        "extracted_bytes": extracted}
with open(meta_path, "w") as fh:
    json.dump(meta, fh, indent=2)
print(f"[fetch] meta: {json.dumps(meta)}")
PYEOF

# Final sanity check: the NDK root must contain the ndk-build entry point.
if [ ! -x "$WORK/ndk/ndk-build" ]; then
  die "$WORK/ndk/ndk-build is missing or not executable"
fi

log "OK: NDK ${NDK_VERSION} ready at $WORK/ndk"
