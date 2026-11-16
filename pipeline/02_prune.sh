#!/usr/bin/env bash
# Stage 2: prune the extracted NDK (work/ndk) into dist/ndk-nano.
#
# The copy is done with hardlinks (cp -al) so the pruned tree costs almost
# nothing on disk. Every deletion below only unlinks names inside dist/;
# stripping writes to a temp file and renames it, which BREAKS the hardlink,
# so the pristine work/ndk tree is never modified.
#
# Sysroot .so files are linker STUBS: their symbol tables are the link
# interface itself, so they are never stripped. Only ELF executables in the
# toolchain bin/ directory are stripped, using the NDK's own llvm-strip.
set -euo pipefail

ABIS="${ABIS:-arm64-v8a}"       # only arm64-v8a is supported today
PROFILE="${PROFILE:-minimal}"   # minimal | standard
API_KEEP="${API_KEEP:-}"        # empty = keep all API levels

PIPE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$PIPE_ROOT/work/ndk"
DIST="$PIPE_ROOT/dist"
DST="$DIST/ndk-nano"
DATA="$PIPE_ROOT/data"

log() { echo "[prune] $*"; }
die() { echo "[prune] ERROR: $*" >&2; exit 1; }

[ -d "$SRC" ] || die "$SRC not found; run pipeline/01_fetch.sh first"

case " $ABIS " in
  *" arm64-v8a "*) : ;;
  *) die "unsupported ABIS='$ABIS' (only arm64-v8a is supported)" ;;
esac
case "$PROFILE" in
  minimal|standard) : ;;
  *) die "unsupported PROFILE='$PROFILE' (expected minimal or standard)" ;;
esac

TOOLCHAIN="$DST/toolchains/llvm/prebuilt/linux-x86_64"
SYSROOT="$TOOLCHAIN/sysroot"
BIN="$TOOLCHAIN/bin"
ELF_MAGIC="$(printf '\177ELF')"

log "resetting $DIST"
rm -rf "$DIST" "$PIPE_ROOT/dist-pkg"
mkdir -p "$DIST" "$DATA"

# ---------------------------------------------------------------------------
# Hardlink copy (fast, disk-cheap); full copy as a cross-filesystem fallback.
# ---------------------------------------------------------------------------
log "copying $SRC -> $DST (hardlinks)"
if cp -al "$SRC" "$DST" 2>/dev/null; then
  log "hardlink copy OK"
else
  log "hardlink copy failed; falling back to a full copy"
  rm -rf "$DST"
  cp -a "$SRC" "$DST"
fi

[ -d "$TOOLCHAIN" ] || die "toolchain directory not found: $TOOLCHAIN"

before_bytes="$(du -sb "$DST" | cut -f1)"
before_files="$(find "$DST" -type f | wc -l)"
log "before: ${before_bytes} bytes, ${before_files} files"

# ---------------------------------------------------------------------------
# (a) sysroot usr/lib: drop directories for non-kept triples.
#     Discovery is by triple NAME pattern, never by hardcoded full paths.
# ---------------------------------------------------------------------------
if [ -d "$SYSROOT/usr/lib" ]; then
  # KEEP-ONLY policy: everything that is not the aarch64 bionic triple goes.
  # (The stock tree also ships riscv64 stubs that would otherwise sneak into
  # the Z3 candidate set.)
  while IFS= read -r -d '' d; do
    log "removing non-kept triple dir: ${d#"$DST"/}"
    rm -rf "$d"
  done < <(find "$SYSROOT/usr/lib" -mindepth 1 -maxdepth 1 -type d \
            ! -name 'aarch64-linux-android' -print0)
fi

# Optional: keep only specific API levels (comma separated, e.g. API_KEEP=24).
if [ -n "$API_KEEP" ] && [ -d "$SYSROOT/usr/lib/aarch64-linux-android" ]; then
  IFS=',' read -r -a keep_apis <<< "$API_KEEP"
  while IFS= read -r -d '' d; do
    api="$(basename "$d")"
    keep=0
    for k in "${keep_apis[@]}"; do
      [ "$k" = "$api" ] && keep=1
    done
    if [ "$keep" = "0" ]; then
      log "removing API level dir (API_KEEP): $api"
      rm -rf "$d"
    fi
  done < <(find "$SYSROOT/usr/lib/aarch64-linux-android" -mindepth 1 -maxdepth 1 \
            -type d -regex '.*/[0-9]\+' -print0)
fi

# ---------------------------------------------------------------------------
# (b) toolchain bin: remove wrappers for non-kept triples and other OSes.
# ---------------------------------------------------------------------------
if [ -d "$BIN" ]; then
  while IFS= read -r -d '' f; do
    rm -f "$f"
  done < <(find "$BIN" -maxdepth 1 \( -type f -o -type l \) \
            \( -name 'i686-linux-android-*' -o -name 'x86_64-linux-android-*' \
            -o -name 'arm-linux-androideabi-*' -o -name 'armv7a-linux-androideabi-*' \
            -o -name '*-windows-*' -o -name '*-darwin-*' \) -print0)
  log "removed non-kept wrapper binaries in bin/"
fi

# ---------------------------------------------------------------------------
# (b2) PROFILE=minimal: whitelist of ESSENTIAL tools in bin/.
#      The full NDK ships clangd, clang-tidy, lldb, llvm-bolt, dsymutil and
#      dozens of other developer tools (~560MB) that are never invoked while
#      BUILDING Android native code. Keep the compile/link/inspect core plus
#      the aarch64 android wrapper scripts and their symlink aliases.
# ---------------------------------------------------------------------------
if [ "$PROFILE" = "minimal" ] && [ -d "$BIN" ]; then
  KEEP_BIN_RE='^(clang|clang\+\+|clang-[0-9]+(\+\+)?|clang-cpp|lld|ld|ld\.lld|ld64\.lld|lld-link|wasm-ld|llvm-(ar|dlltool|lib|ranlib|nm|objcopy|strip|readobj|readelf|size|strings|cxxfilt|symbolizer|addr2line|profdata|rc|windres)|aarch64-linux-android.*)$'
  removed_tools=0
  while IFS= read -r -d '' f; do
    base="$(basename "$f")"
    if ! printf '%s' "$base" | grep -Eq "$KEEP_BIN_RE"; then
      rm -f "$f"
      removed_tools=$((removed_tools + 1))
    fi
  done < <(find "$BIN" -maxdepth 1 \( -type f -o -type l \) -print0)
  # Second pass: drop symlinks whose target no longer exists (e.g. wrappers
  # pointing at deleted tools).
  while IFS= read -r -d '' f; do
    if [ -L "$f" ] && [ ! -e "$f" ]; then
      rm -f "$f"
      removed_tools=$((removed_tools + 1))
    fi
  done < <(find "$BIN" -maxdepth 1 \( -type f -o -type l \) -print0)
  log "minimal profile: removed ${removed_tools} non-essential tools from bin/"
fi

# ---------------------------------------------------------------------------
# (c) clang runtime dirs: keep only what an arm64-v8a Android build links
#     against. The stock tree ships runtimes for musl, gnu, i386, x86_64, arm,
#     riscv and baremetal targets (~230MB) plus per-arch sanitizer subdirs
#     under lib/linux. PROFILE=minimal keeps ONLY builtins+profile for
#     aarch64-android; standard keeps the whole aarch64 set.
# ---------------------------------------------------------------------------
for RTLAYER in "$TOOLCHAIN"/lib/clang/*/lib; do
  [ -d "$RTLAYER" ] || continue
  # (c1) drop every non-Android target dir next to linux/ (musl, gnu, ...).
  while IFS= read -r -d '' d; do
    name="$(basename "$d")"
    case "$name" in
      linux) continue ;;
      aarch64-*android*|aarch64-linux-android*) [ "$PROFILE" = "standard" ] && continue ;;
    esac
    log "removing clang runtime target dir: ${d#"$DST"/}"
    rm -rf "$d"
  done < <(find "$RTLAYER" -mindepth 1 -maxdepth 1 -type d -print0)
done

for RT in "$TOOLCHAIN"/lib/clang/*/lib/linux; do
  [ -d "$RT" ] || continue
  removed_rt=0
  # (c2) per-arch subdirectories (sanitizer/ubsan runtimes etc).
  while IFS= read -r -d '' d; do
    name="$(basename "$d")"
    case "$name" in
      aarch64)
        if [ "$PROFILE" = "standard" ]; then continue; fi
        # minimal: inside aarch64/ keep ONLY the pieces the clang driver links
        # by default on Android (libunwind.a for exceptions/backtraces and the
        # tiny libatomic.a). libFuzzer/libomp/lldb-server are dropped.
        while IFS= read -r -d '' sf; do
          sbase="$(basename "$sf")"
          case "$sbase" in
            libunwind.a|libatomic.a) : ;;
            *)
              rm -f "$sf"
              removed_rt=$((removed_rt + 1))
              log "  minimal: removed ${sf#"$DST"/}"
              ;;
          esac
        done < <(find "$d" -maxdepth 1 -type f -print0)
        continue
        ;;
    esac
    log "removing clang runtime arch dir: ${d#"$DST"/}"
    rm -rf "$d"
    removed_rt=$((removed_rt + 1))
  done < <(find "$RT" -mindepth 1 -maxdepth 1 -type d -print0)
  # (c3) top-level runtime files: aarch64-android only; minimal keeps just
  #      builtins + profile (the two a normal Android build links).
  while IFS= read -r -d '' f; do
    base="$(basename "$f")"
    arch_ok=1
    case "$base" in
      *-aarch64-android*) arch_ok=1 ;;
      *-i386-*|*-i586-*|*-i686-*|*-x86_64-*|*-arm-*|*-armhf-*|*-armv7*-*|\
      *-riscv32-*|*-riscv64-*|*-f16-*|*-aarch64_32-*|*-wasm32-*|*-powerpc64*-*)
        arch_ok=0 ;;
    esac
    if [ "$arch_ok" = "1" ] && [ "$PROFILE" = "minimal" ]; then
      case "$base" in
        libclang_rt.builtins-aarch64-android.a|libclang_rt.profile*) : ;;
        *) arch_ok=0 ;;   # sanitizer runtimes dropped in the minimal profile
      esac
    fi
    if [ "$arch_ok" = "0" ]; then
      rm -f "$f"
      removed_rt=$((removed_rt + 1))
    fi
  done < <(find "$RT" -maxdepth 1 -type f -print0)
  log "clang runtime ${RT#"$DST"/}: removed ${removed_rt} files (profile=$PROFILE)"
done

# ---------------------------------------------------------------------------
# (d) toolchain lib: drop other-target directories. minimal keeps ONLY the
#     clang/ resource dir (its runtime/include layout); standard additionally
#     keeps aarch64-* target dirs. Also drops host-side debugging libraries
#     (liblldb ~165MB, LLVMPolly, libxml2, libedit, python3.11) in minimal.
# ---------------------------------------------------------------------------
if [ -d "$TOOLCHAIN/lib" ]; then
  while IFS= read -r -d '' d; do
    name="$(basename "$d")"
    case "$name" in
      clang) continue ;;
      aarch64-*android*|aarch64-linux-android*)
        [ "$PROFILE" = "standard" ] && continue
        log "removing toolchain lib dir (minimal): $name"
        rm -rf "$d"
        continue
        ;;
      aarch64*)
        # aarch64 musl/gnu target dirs are NOT needed for bionic builds.
        log "removing toolchain lib dir: $name"
        rm -rf "$d"
        continue
        ;;
      arm-*|armv7*-*|i686-*|i386-*|x86_64-*|*-pc-linux-gnu|*-unknown-linux-gnu|*-unknown-linux-*|*-w64-windows-*|*-linux-musl*)
        log "removing toolchain lib dir: $name"
        rm -rf "$d"
        ;;
    esac
  done < <(find "$TOOLCHAIN/lib" -mindepth 1 -maxdepth 1 -type d -print0)

  if [ "$PROFILE" = "minimal" ]; then
    # Keep exactly the host shared libraries that the KEPT bin/ tools need
    # (computed from their DT_NEEDED entries), drop the rest. This is not a
    # fixed list on purpose: ld.lld links libxml2.so.2 DYNAMICALLY and the
    # NDK ships its own copy in lib/ (RUNPATH=$ORIGIN/../lib) precisely so
    # the toolchain runs on minimal hosts like CI runners - deleting it
    # breaks every link on hosts without a system libxml2.
    needed_list="$(mktemp)"
    while IFS= read -r -d '' f; do
      [ -f "$f" ] || continue
      case "$(basename "$f")" in *.a|*.o) continue ;; esac
      if [ "$(head -c 4 "$f" 2>/dev/null || true)" != "$ELF_MAGIC" ]; then
        continue
      fi
      "$BIN/llvm-readelf" -d "$f" 2>/dev/null \
        | grep -oP 'Shared library: \[\K[^\]]+' >> "$needed_list" || true
    done < <(find "$BIN" -maxdepth 1 \( -type f -o -type l \) -print0)
    sort -u "$needed_list" -o "$needed_list"

    removed_host=0
    while IFS= read -r -d '' hl; do
      name="$(basename "$hl")"
      # Resolve symlinks: keep libxml2.so when libxml2.so.2 is needed.
      target=""
      if [ -L "$hl" ]; then
        target="$(basename "$(readlink "$hl")")"
      fi
      if grep -qxF "$name" "$needed_list" \
         || { [ -n "$target" ] && grep -qxF "$target" "$needed_list"; }; then
        continue
      fi
      rm -f "$hl"
      removed_host=$((removed_host + 1))
    done < <(find "$TOOLCHAIN/lib" -mindepth 1 -maxdepth 1 \( -type f -o -type l \) -print0)
    rm -f "$needed_list"
    rm -rf "$TOOLCHAIN/lib/python3.11"
    log "minimal profile: kept host libs per DT_NEEDED closure, removed ${removed_host} others from lib/"
  fi
fi

# ---------------------------------------------------------------------------
# (e) drop big NDK components that are irrelevant to arm64 native builds.
# ---------------------------------------------------------------------------
for extra in simpleperf shader-tools prebuilt gdbserver sources/third_party/shaderc; do
  if [ -e "$DST/$extra" ]; then
    log "removing $extra"
    rm -rf "$DST/$extra"
  fi
done

# (e2) the musl sysroot (~91MB) targets non-Android libc; even the standard
#      profile never needs it for bionic builds.
if [ -d "$TOOLCHAIN/musl" ]; then
  log "removing toolchain musl sysroot"
  rm -rf "$TOOLCHAIN/musl"
fi

# (e3) PROFILE=minimal: embedded python3 runtime (~40MB) only serves lldb
#      and clang tooling that were removed above.
if [ "$PROFILE" = "minimal" ]; then
  for extra_py in "$TOOLCHAIN/python3" "$DST/python-packages"; do
    if [ -e "$extra_py" ]; then
      log "removing ${extra_py#"$DST"/}"
      rm -rf "$extra_py"
    fi
  done
fi
# Keep: build/, meta/, ndk-build, source.properties, NOTICE, all
# README/LICENSE files, sources/android/cpufeatures (all handled by NOT
# being in any removal list above).

# ---------------------------------------------------------------------------
# (f) strip ELF executables in toolchain bin/ with the NDK's own llvm-strip.
#     Writing to a temp file and renaming breaks the hardlink, so work/ndk
#     keeps the pristine unstripped binary. NEVER strip sysroot stubs or
#     .a archives.
# ---------------------------------------------------------------------------
stripped=0
STRIP="$BIN/llvm-strip"
if [ -x "$STRIP" ]; then
  while IFS= read -r -d '' f; do
    [ -f "$f" ] || continue
    [ -x "$f" ] || continue
    case "$f" in
      *.a|*.o) continue ;;
    esac
    # Compare the first 4 bytes with \x7fELF.
    if [ "$(head -c 4 "$f" 2>/dev/null || true)" != "$ELF_MAGIC" ]; then
      continue
    fi
    if "$STRIP" --strip-all -o "$f.tmp" "$f" 2>/dev/null; then
      chmod --reference="$f" "$f.tmp" 2>/dev/null || true
      mv "$f.tmp" "$f"
      stripped=$((stripped + 1))
    else
      rm -f "$f.tmp"
      log "WARNING: strip failed for ${f#"$DST"/}"
    fi
  done < <(find "$BIN" -maxdepth 1 -type f -print0)
  log "stripped ${stripped} binaries with llvm-strip"
else
  log "WARNING: llvm-strip not found; skipping strip step"
fi

# ---------------------------------------------------------------------------
# Metrics + full size index.
# ---------------------------------------------------------------------------
after_bytes="$(du -sb "$DST" | cut -f1)"
after_files="$(find "$DST" -type f | wc -l)"
removed_files=$((before_files - after_files))

log "after: ${after_bytes} bytes, ${after_files} files (removed ${removed_files} files)"

python3 - "$DATA" "$DST" "$before_bytes" "$after_bytes" "$removed_files" "$stripped" <<'PYEOF'
import json
import os
import sys

data_dir, dst, before, after, removed, stripped = sys.argv[1:7]
os.makedirs(data_dir, exist_ok=True)

metrics = {
    "before_bytes": int(before),
    "after_bytes": int(after),
    "removed_files": int(removed),
    "stripped_binaries": int(stripped),
}
with open(os.path.join(data_dir, "metrics-prune.json"), "w") as fh:
    json.dump(metrics, fh, indent=2)

# sizes.json: {relpath: bytes} for every file under dst (cap 80000 entries).
CAP = 80000
files = {}
stop = False
for root, dirs, names in os.walk(dst):
    if stop:
        break
    dirs.sort()
    for name in sorted(names):
        path = os.path.join(root, name)
        if not os.path.isfile(path):
            continue
        rel = os.path.relpath(path, dst)
        try:
            files[rel] = os.path.getsize(path)
        except OSError:
            continue
        if len(files) >= CAP:
            stop = True
            break

with open(os.path.join(data_dir, "sizes.json"), "w") as fh:
    json.dump({"files": files}, fh, indent=2, sort_keys=True)

print(f"[prune] metrics written to {data_dir}/metrics-prune.json")
print(f"[prune] sizes.json written ({len(files)} files)")
PYEOF

log "OK: pruned tree at $DST"
