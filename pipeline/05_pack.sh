#!/usr/bin/env bash
# Stage 5: pack dist/ndk-nano (and the tailored tree, if present) into
# deterministic zstd and/or xz tarballs under dist-pkg/.
#
# COMPRESS=both|zstd|xz, ZSTD_LEVEL (default 19), XZ_LEVEL (default 9e).
# When the zstd CLI is missing the python "zstandard" module is used as a
# fallback; if that is missing too, the .zst package is skipped with a
# warning (xz is always available on the targets we care about).
set -euo pipefail

COMPRESS="${COMPRESS:-both}"
ZSTD_LEVEL="${ZSTD_LEVEL:-19}"
XZ_LEVEL="${XZ_LEVEL:-9e}"
NDK_VERSION="${NDK_VERSION:-r27c}"

PIPE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST="$PIPE_ROOT/dist"
DIST_PKG="$PIPE_ROOT/dist-pkg"
DATA="$PIPE_ROOT/data"

log() { echo "[pack] $*"; }
die() { echo "[pack] ERROR: $*" >&2; exit 1; }

case "$COMPRESS" in
  both|zstd|xz) : ;;
  *) die "COMPRESS must be one of: both, zstd, xz (got '$COMPRESS')" ;;
esac

# Deterministic tar: sorted names, pinned mtime, root ownership.
TAR_ARGS=(--sort=name --mtime='2025-01-01 00:00:00 UTC' --owner=0 --group=0 --numeric-owner)

pack_zstd() {
  local name="$1" out="$2"
  rm -f "$out"
  if command -v zstd >/dev/null 2>&1; then
    log "packing $name -> $out (zstd CLI, level $ZSTD_LEVEL)"
    tar "${TAR_ARGS[@]}" -C "$DIST" -cf - "$name" \
      | zstd -q -"${ZSTD_LEVEL}" -T0 > "$out"
  elif python3 -c 'import zstandard' >/dev/null 2>&1; then
    log "packing $name -> $out (python zstandard fallback, level $ZSTD_LEVEL)"
    tar "${TAR_ARGS[@]}" -C "$DIST" -cf - "$name" \
      | python3 -c '
import sys
from zstandard import ZstdCompressor

level = int(sys.argv[1])
compressor = ZstdCompressor(level=level)
with open(sys.argv[2], "wb") as out:
    with compressor.stream_writer(out) as writer:
        while True:
            chunk = sys.stdin.buffer.read(1024 * 1024)
            if not chunk:
                break
            writer.write(chunk)
' "$ZSTD_LEVEL" "$out"
  else
    log "WARNING: neither the zstd CLI nor python zstandard is available; skipping $out"
    return 1
  fi
  log "wrote $out ($(stat -c %s "$out") bytes)"
}

pack_xz() {
  local name="$1" out="$2"
  rm -f "$out"
  log "packing $name -> $out (xz, level $XZ_LEVEL)"
  tar "${TAR_ARGS[@]}" -C "$DIST" -cf - "$name" | xz -"${XZ_LEVEL}" -T0 > "$out"
  log "wrote $out ($(stat -c %s "$out") bytes)"
}

[ -d "$DIST/ndk-nano" ] || die "$DIST/ndk-nano not found; run pipeline/02_prune.sh first"

mkdir -p "$DIST_PKG" "$DATA"

BASE_FULL="ndk-nano-${NDK_VERSION}-linux-arm64"
BASE_TAILORED="ndk-nano-${NDK_VERSION}-linux-arm64-tailored"

if [ "$COMPRESS" = "zstd" ] || [ "$COMPRESS" = "both" ]; then
  pack_zstd "ndk-nano" "$DIST_PKG/${BASE_FULL}.tar.zst" || true
fi
if [ "$COMPRESS" = "xz" ] || [ "$COMPRESS" = "both" ]; then
  pack_xz "ndk-nano" "$DIST_PKG/${BASE_FULL}.tar.xz"
fi

if [ -d "$DIST/ndk-nano-tailored" ] && [ -f "$DATA/tailored-keep.txt" ]; then
  if [ "$COMPRESS" = "zstd" ] || [ "$COMPRESS" = "both" ]; then
    pack_zstd "ndk-nano-tailored" "$DIST_PKG/${BASE_TAILORED}.tar.zst" || true
  fi
  if [ "$COMPRESS" = "xz" ] || [ "$COMPRESS" = "both" ]; then
    pack_xz "ndk-nano-tailored" "$DIST_PKG/${BASE_TAILORED}.tar.xz"
  fi
else
  log "tailored tree or keep list missing; skipping -tailored packages"
fi

# Metrics: list every package, choose the smallest FULL package.
python3 - "$DATA" "$DIST_PKG" <<'PYEOF'
import glob
import json
import os
import sys

data_dir, dist_pkg = sys.argv[1], sys.argv[2]
files = []
for path in sorted(glob.glob(os.path.join(dist_pkg, "*.tar.zst"))
                   + glob.glob(os.path.join(dist_pkg, "*.tar.xz"))):
    files.append({"name": os.path.basename(path),
                  "bytes": os.path.getsize(path)})
full = [f for f in files if "tailored" not in f["name"]]
chosen = None
if full:
    best = min(full, key=lambda f: f["bytes"])
    chosen = {"name": best["name"], "bytes": best["bytes"],
              "format": "zst" if best["name"].endswith(".zst") else "xz"}
metrics = {"files": files, "chosen": chosen}
with open(os.path.join(data_dir, "metrics-pack.json"), "w") as fh:
    json.dump(metrics, fh, indent=2)
print(f"[pack] metrics: {json.dumps(metrics)}")
PYEOF

log "OK: packages in $DIST_PKG"
