#!/usr/bin/env python3
"""Build the tailored NDK tree (dist/ndk-nano-tailored) from the Z3 keep list.

The source tree is copied with hardlinks (fallback: full copy), then every
file that is not part of the keep policy is deleted. Because deletions only
unlink names inside the destination tree, dist/ndk-nano itself is never
touched.
"""

import argparse
import fnmatch
import os
import shutil
import sys

TOOLCHAIN_REL = "toolchains/llvm/prebuilt/linux-x86_64"
BIN_REL = TOOLCHAIN_REL + "/bin"
SYSROOT_INCLUDE_REL = TOOLCHAIN_REL + "/sysroot/usr/include"
ABI_LIB_REL = TOOLCHAIN_REL + "/sysroot/usr/lib/aarch64-linux-android"
TOOLCHAIN_LIB_REL = TOOLCHAIN_REL + "/lib"

# Core executables that must survive in any tailored tree.
CORE_BIN = {
    "clang", "clang++", "lld", "ld.lld",
    "llvm-ar", "llvm-nm", "llvm-strip", "llvm-readelf",
    "llvm-ranlib", "llvm-objcopy",
}
# Target-prefixed wrapper scripts/symlinks kept for ndk-build and CMake.
WRAPPER_GLOB = "aarch64-linux-android*-clang*"

# Top-level components removed exactly like in pipeline/02_prune.sh.
REMOVE_TOP = {"simpleperf", "shader-tools", "prebuilt", "gdbserver"}
REMOVE_PREFIXES = ("sources/third_party/shaderc",)


def log(msg):
    print(f"[tailored] {msg}", flush=True)


def parse_args():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--src", default="dist/ndk-nano")
    ap.add_argument("--dst", default="dist/ndk-nano-tailored")
    ap.add_argument("--keep", default="data/tailored-keep.txt")
    return ap.parse_args()


def copy_tree(src, dst):
    """Hardlink copy with a portable fallback; symlinks copied as links."""
    for root, dirs, names in os.walk(src):
        rel = os.path.relpath(root, src)
        target_root = dst if rel == "." else os.path.join(dst, rel)
        os.makedirs(target_root, exist_ok=True)
        for name in names:
            s = os.path.join(root, name)
            t = os.path.join(target_root, name)
            if os.path.islink(s):
                os.symlink(os.readlink(s), t)
                continue
            try:
                os.link(s, t)  # O(1) in disk space
            except OSError:
                shutil.copy2(s, t)


def load_keep(path):
    keep_paths = set()
    with open(path) as fh:
        for line in fh:
            line = line.strip()
            if line and not line.startswith("#"):
                keep_paths.add(line)
    return keep_paths


def build_bin_keep(src):
    """Core tools + wrappers + the symlink closure inside bin/."""
    keep = set(CORE_BIN)
    bin_dir = os.path.join(src, BIN_REL)
    if os.path.isdir(bin_dir):
        for name in os.listdir(bin_dir):
            if fnmatch.fnmatch(name, WRAPPER_GLOB):
                keep.add(name)
        # Wrappers are symlinks (e.g. clang++ -> clang, ld.lld -> lld):
        # resolve their targets so nothing dangles after pruning.
        changed = True
        while changed:
            changed = False
            for name in list(keep):
                p = os.path.join(bin_dir, name)
                if os.path.islink(p):
                    target = os.path.basename(os.readlink(p))
                    if (target and target not in keep
                            and os.path.exists(os.path.join(bin_dir, target))):
                        keep.add(target)
                        changed = True
    return keep


def file_policy(rel, keep_paths, keep_basenames, bin_keep):
    """True when a file must survive in the tailored tree."""
    top = rel.split("/", 1)[0]
    if top in REMOVE_TOP:
        return False
    if rel.startswith(REMOVE_PREFIXES):
        return False

    base = os.path.basename(rel)
    # Licensing and documentation always survive.
    if base.startswith("README") or base.startswith("LICENSE") or "NOTICE" in base:
        return True
    if rel in ("ndk-build", "source.properties", "NOTICE"):
        return True
    # ndk-build machinery and metadata.
    if rel.startswith("build/") or rel == "build":
        return True
    if rel.startswith("meta/") or rel == "meta":
        return True
    # ALL headers stay.
    if rel.startswith(SYSROOT_INCLUDE_REL + "/"):
        return True
    # Clang builtin headers (stdarg.h, stddef.h, stdint.h, ...) are part of
    # the compiler itself: no compilation works without them. Always keep.
    if fnmatch.fnmatch(rel, TOOLCHAIN_REL + "/lib/clang/*/include/*"):
        return True
    # ABI libraries: only keep-list basenames or crt objects.
    if rel.startswith(ABI_LIB_REL + "/"):
        return base in keep_basenames or fnmatch.fnmatch(base, "crt*.o")
    # Toolchain lib tree: only keep-list paths, the builtins archive, the
    # driver-implicit unwinder/atomics and clang resource metadata.
    if rel.startswith(TOOLCHAIN_LIB_REL + "/"):
        if rel in keep_paths or base == "libclang_rt.builtins-aarch64-android.a":
            return True
        if base in ("libunwind.a", "libatomic.a"):
            return True
        # Top-level host shared libraries (incl. versioned .so.N) are runtime
        # dependencies of the kept compiler/linker binaries (ld.lld needs
        # libxml2.so.2 on hosts without a system copy).
        rest = rel[len(TOOLCHAIN_LIB_REL) + 1:]
        if "/" not in rest and (base.endswith(".so") or ".so." in base):
            return True
        # clang resource-dir metadata (share/, bin/); include/ is handled above.
        if fnmatch.fnmatch(rel, TOOLCHAIN_REL + "/lib/clang/*/share/*") or \
           fnmatch.fnmatch(rel, TOOLCHAIN_REL + "/lib/clang/*/bin/*"):
            return True
        return False
    # Toolchain bin: core tools and wrappers only.
    if rel.startswith(BIN_REL + "/"):
        return base in bin_keep
    # Everything else (already pruned once, conservative default keep).
    return True


def main():
    args = parse_args()

    if not os.path.isdir(args.src):
        log(f"ERROR: source tree not found: {args.src}")
        sys.exit(2)
    if not os.path.isfile(args.keep):
        log(f"ERROR: keep list not found: {args.keep}")
        sys.exit(2)

    keep_paths = load_keep(args.keep)
    keep_basenames = {os.path.basename(p) for p in keep_paths}
    bin_keep = build_bin_keep(args.src)
    log(f"keep list: {len(keep_paths)} paths; bin keep set: {len(bin_keep)}")

    log(f"copying {args.src} -> {args.dst} (hardlinks)")
    shutil.rmtree(args.dst, ignore_errors=True)
    copy_tree(args.src, args.dst)

    removed = 0
    kept = 0
    for root, dirs, names in os.walk(args.dst, topdown=False):
        for name in names:
            path = os.path.join(root, name)
            rel = os.path.relpath(path, args.dst)
            if file_policy(rel, keep_paths, keep_basenames, bin_keep):
                kept += 1
            else:
                os.unlink(path)
                removed += 1
        # Drop directories that became empty (never the tree root itself).
        if root != args.dst:
            try:
                os.rmdir(root)
            except OSError:
                pass

    total_bytes = 0
    for root, dirs, names in os.walk(args.dst):
        for name in names:
            try:
                total_bytes += os.path.getsize(os.path.join(root, name))
            except OSError:
                pass

    log(f"kept {kept} files, removed {removed} files")
    log(f"du -sb equivalent: {args.dst} = {total_bytes} bytes "
        f"({total_bytes / 1048576:.2f} MiB)")


if __name__ == "__main__":
    main()
