#!/usr/bin/env python3
"""Stage 3: build the "header -> assembly representation" manifest.

For every sysroot header we compile a translation unit that only includes
that header, using the NDK's own clang, and record the resulting assembly
fingerprint (bytes, sha256, defined symbols, called symbols), the macro
count from the preprocessor, and the header's own direct #include lines.

If clang cannot be found the script switches to "no_compiler" mode: every
header gets status "no_compiler", all compiler-derived fields stay null,
but include relations are still parsed. This keeps the pipeline (and the
fixture tests) deterministic on machines without the NDK.
"""

import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone

# Matches "#include <foo>" / "#include \"foo\"" at line starts.
INCLUDE_RE = re.compile(r'^\s*#\s*include\s*[<"]([^>"]+)[>"]', re.MULTILINE)
# .globl directives in AArch64 assembly (declared/visible symbols).
GLOBL_RE = re.compile(r'^\s*\.globl\s+(\S+)', re.MULTILINE)
# AArch64 branch-and-link instructions (outgoing calls).
CALL_RE = re.compile(r'\bbl\s+([A-Za-z_$][\w$.]*)')

# Headers always processed even when --max-headers is in effect.
ALWAYS_INCLUDE = [
    "jni.h", "stdio.h", "stdlib.h", "string.h", "math.h",
    "android/log.h", "unistd.h", "errno.h", "time.h",
    "c++/v1/vector", "c++/v1/string", "c++/v1/memory",
]

# Preferred order for the asm_samples section.
SAMPLE_PREFERRED = ["jni.h", "stdio.h", "c++/v1/vector", "math.h",
                    "android/log.h", "string.h"]

TOOLCHAIN_REL = os.path.join("toolchains", "llvm", "prebuilt", "linux-x86_64")
CLANG_REL = os.path.join(TOOLCHAIN_REL, "bin", "clang")
INCLUDE_REL = os.path.join(TOOLCHAIN_REL, "sysroot", "usr", "include")

TIMEOUT_SECS = 25
ASM_TEXT_LIMIT = 6000


def log(msg):
    print(f"[manifest] {msg}", file=sys.stderr, flush=True)


def parse_args():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--ndk", default="work/ndk",
                    help="path to the extracted NDK (default: work/ndk)")
    ap.add_argument("--out", default="data/manifest.json",
                    help="output manifest path (default: data/manifest.json)")
    ap.add_argument("--jobs", type=int, default=2,
                    help="parallel compiler invocations (default: 2)")
    ap.add_argument("--api", type=int, default=24,
                    help="Android API level for --target (default: 24)")
    ap.add_argument("--sample-asm", type=int, default=6,
                    help="number of stored full asm samples (default: 6)")
    ap.add_argument("--max-headers", type=int, default=0,
                    help="process at most N headers, 0 = all (default: 0)")
    ap.add_argument("--target", default="aarch64-linux-android",
                    help="gnu triple for --target (default: aarch64-linux-android)")
    return ap.parse_args()


def classify(rel):
    """Decide whether a file under usr/include belongs to the universe.

    Rules: outside c++/v1 only *.h files are taken; inside c++/v1 only
    top-level public headers are taken (internal __ detail directories and
    __-prefixed names are skipped to keep the run bounded).
    """
    name = rel.rsplit("/", 1)[-1]
    if name.startswith("__"):
        return "skip"
    if rel.startswith("c++/v1/"):
        rest = rel[len("c++/v1/"):]
        if "/" in rest:
            return "skip"
        return "keep"
    if rel.endswith(".h"):
        return "keep"
    return "skip"


def discover_headers(include_root):
    found, skipped = [], []
    for root, dirs, names in os.walk(include_root):
        dirs.sort()
        for name in sorted(names):
            rel = os.path.relpath(os.path.join(root, name), include_root)
            rel = rel.replace(os.sep, "/")
            if classify(rel) == "keep":
                found.append(rel)
            else:
                skipped.append(rel)
    return sorted(found), sorted(skipped)


def process_header(header, include_root, clang, target_flag):
    """Compile one header TU and return (record, asm_text_or_None)."""
    is_cpp = header.startswith("c++/")
    record = {
        "status": None,
        "asm_bytes": None,
        "asm_sha256": None,
        "macro_count": None,
        "symbols_defined": None,
        "calls": None,
        "includes": [],
    }
    asm_text = None

    # Parse the header's own direct includes; works in every mode.
    header_path = os.path.join(include_root, *header.split("/"))
    try:
        with open(header_path, encoding="utf-8", errors="replace") as fh:
            text = fh.read()
        record["includes"] = sorted({m.group(1) for m in INCLUDE_RE.finditer(text)})
    except OSError as exc:
        record["stderr"] = f"read error: {exc}"[:200]

    if clang is None:
        record["status"] = "no_compiler"
        return record, asm_text

    lang_flags = ["-x", "c++", "-std=c++17"] if is_cpp else ["-x", "c"]

    try:
        with tempfile.TemporaryDirectory(prefix="ndk-nano-manifest-") as tmp:
            tu_name = "tu.cpp" if is_cpp else "tu.c"
            with open(os.path.join(tmp, tu_name), "w") as fh:
                fh.write(f"#include <{header}>\n")

            # (a) macro fingerprint: count preprocessor #define lines.
            try:
                r = subprocess.run(
                    [clang, target_flag, *lang_flags, "-E", "-dM", tu_name],
                    cwd=tmp, capture_output=True, text=True, timeout=TIMEOUT_SECS)
                if r.returncode == 0:
                    record["macro_count"] = sum(
                        1 for line in r.stdout.splitlines()
                        if line.startswith("#define"))
            except Exception:
                pass  # macro info is best-effort; asm decides the status

            # (b) assembly fingerprint.
            try:
                r = subprocess.run(
                    [clang, target_flag, *lang_flags, "-Oz", "-S",
                     "-o", "tu.s", tu_name],
                    cwd=tmp, capture_output=True, text=True, timeout=TIMEOUT_SECS)
                asm_path = os.path.join(tmp, "tu.s")
                if r.returncode == 0 and os.path.exists(asm_path):
                    with open(asm_path, "rb") as fh:
                        data = fh.read()
                    asm_text = data.decode("utf-8", errors="replace")
                    record["asm_bytes"] = len(data)
                    record["asm_sha256"] = hashlib.sha256(data).hexdigest()
                    record["symbols_defined"] = sorted(set(GLOBL_RE.findall(asm_text)))
                    record["calls"] = sorted(set(CALL_RE.findall(asm_text)))
                    record["status"] = "ok"
                else:
                    record["status"] = "fail"
                    lines = (r.stderr or "").strip().splitlines()
                    record["stderr"] = (lines[-1] if lines else "unknown error")[:200]
            except subprocess.TimeoutExpired:
                record["status"] = "fail"
                record["stderr"] = f"compile timeout after {TIMEOUT_SECS}s"
            except Exception as exc:  # never let one header kill the run
                record["status"] = "fail"
                record["stderr"] = str(exc)[:200]
    except Exception as exc:
        record["status"] = "fail"
        record["stderr"] = str(exc)[:200]

    return record, asm_text


def main():
    args = parse_args()

    include_root = os.path.join(args.ndk, *INCLUDE_REL.split(os.sep))
    clang_path = os.path.join(args.ndk, *CLANG_REL.split(os.sep))

    if not os.path.isdir(include_root):
        log(f"ERROR: sysroot include dir not found: {include_root}")
        sys.exit(2)

    if os.path.isfile(clang_path) and os.access(clang_path, os.X_OK):
        clang = clang_path
        mode = "compiler"
        log(f"clang: {clang}")
    else:
        clang = None
        mode = "no_compiler"
        log("ERROR: clang not found under the NDK; switching to NO-COMPILER "
            "mode (include relations still parsed, asm fields null)")

    target_flag = f"--target={args.target}{args.api}"
    log(f"target flag: {target_flag}")

    headers, skipped = discover_headers(include_root)
    log(f"header universe: {len(headers)} headers "
        f"({len(skipped)} internal/skipped files)")

    if args.max_headers > 0:
        chosen = [h for h in ALWAYS_INCLUDE if h in set(headers)]
        for h in headers:
            if len(chosen) >= args.max_headers:
                break
            if h not in chosen:
                chosen.append(h)
        # Keep deterministic ordering.
        to_process = sorted(set(chosen))
    else:
        to_process = headers

    log(f"processing {len(to_process)} headers with {args.jobs} jobs")

    records = {}
    asm_texts = {}
    done = 0
    t0 = time.time()
    with ThreadPoolExecutor(max_workers=max(1, args.jobs)) as pool:
        futures = {
            pool.submit(process_header, h, include_root, clang, target_flag): h
            for h in to_process
        }
        for fut in as_completed(futures):
            header = futures[fut]
            try:
                record, asm_text = fut.result()
            except Exception as exc:  # defensive: a worker must never kill us
                record = {"status": "fail", "asm_bytes": None,
                          "asm_sha256": None, "macro_count": None,
                          "symbols_defined": None, "calls": None,
                          "includes": [], "stderr": str(exc)[:200]}
                asm_text = None
            records[header] = record
            if asm_text is not None:
                asm_texts[header] = asm_text
            done += 1
            if done % 100 == 0 or done == len(to_process):
                log(f"progress: {done}/{len(to_process)} "
                    f"({time.time() - t0:.1f}s)")

    # Select asm samples: preferred list first, then largest by bytes.
    samples = []
    for h in SAMPLE_PREFERRED:
        if h in records and records[h]["status"] == "ok":
            samples.append(h)
            if len(samples) >= args.sample_asm:
                break
    if len(samples) < args.sample_asm:
        rest = sorted(
            (h for h, r in records.items() if r["status"] == "ok"),
            key=lambda h: -(records[h]["asm_bytes"] or 0))
        for h in rest:
            if h in samples:
                continue
            samples.append(h)
            if len(samples) >= args.sample_asm:
                break
    asm_samples = {
        h: {
            "bytes": records[h]["asm_bytes"],
            "sha256": records[h]["asm_sha256"],
            "asm_text": asm_texts.get(h, "")[:ASM_TEXT_LIMIT],
        }
        for h in samples
    }

    totals = {
        "headers_total": len(records),
        "ok": sum(1 for r in records.values() if r["status"] == "ok"),
        "fail": sum(1 for r in records.values() if r["status"] == "fail"),
        "no_compiler": sum(1 for r in records.values()
                           if r["status"] == "no_compiler"),
        "asm_bytes_total": sum(r["asm_bytes"] or 0 for r in records.values()),
        "macros_total": sum(r["macro_count"] or 0 for r in records.values()),
        "symbols_total": sum(len(r["symbols_defined"] or [])
                             for r in records.values()),
    }

    manifest = {
        "meta": {
            "ndk": os.path.abspath(args.ndk),
            "api": args.api,
            "target": args.target,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "mode": mode,
        },
        "headers": {h: records[h] for h in sorted(records)},
        "totals": totals,
        "asm_samples": asm_samples,
        "skipped": skipped,
    }

    out_dir = os.path.dirname(os.path.abspath(args.out))
    os.makedirs(out_dir, exist_ok=True)
    with open(args.out, "w") as fh:
        json.dump(manifest, fh, indent=2, ensure_ascii=False)

    log(f"totals: {json.dumps(totals)}")
    log(f"wrote {args.out} ({len(asm_samples)} asm samples)")


if __name__ == "__main__":
    main()
