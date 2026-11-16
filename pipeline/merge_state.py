#!/usr/bin/env python3
"""Merge per-stage metrics into data/pipeline-state.json.

The output schema is STABLE and consumed by an external web dashboard:
key names must not change. Missing inputs become null (or [] where the
schema requires a list). MB values are MiB rounded to 2 decimals.
"""

import argparse
import json
import os
from datetime import datetime, timezone

MIB = 1024 * 1024
BUDGET_BYTES = 314572800  # 300 MiB


def load(path):
    try:
        with open(path) as fh:
            return json.load(fh)
    except Exception:
        return None


def mb(value):
    if not isinstance(value, (int, float)) or value < 0:
        return None
    return round(value / MIB, 2)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--data-dir", default="data")
    ap.add_argument("--work-dir", default="work")
    ap.add_argument("--out", default="data/pipeline-state.json")
    args = ap.parse_args()

    ndk_meta = load(os.path.join(args.work_dir, "meta.json")) or {}
    prune = load(os.path.join(args.data_dir, "metrics-prune.json")) or {}
    manifest = load(os.path.join(args.data_dir, "manifest.json")) or {}
    totals = manifest.get("totals") or {}
    z3_report = load(os.path.join(args.data_dir, "z3_report.json")) or {}
    pack = load(os.path.join(args.data_dir, "metrics-pack.json")) or {}
    verify = load(os.path.join(args.data_dir, "verify.json")) or {}

    chosen = pack.get("chosen") or {}
    package_bytes = chosen.get("bytes")

    # Smallest tailored package (any format), if any.
    tailored_bytes = None
    for entry in pack.get("files") or []:
        if "tailored" in entry.get("name", ""):
            size = entry.get("bytes")
            if isinstance(size, int) and (tailored_bytes is None
                                          or size < tailored_bytes):
                tailored_bytes = size

    # Shrink ratio: pruned tree (fallback: extracted NDK) vs chosen package.
    base = prune.get("after_bytes")
    if not isinstance(base, int):
        base = ndk_meta.get("extracted_bytes")
    ratio = None
    if isinstance(base, int) and isinstance(package_bytes, int) and package_bytes > 0:
        ratio = round(base / package_bytes, 2)

    within_budget = None
    if isinstance(package_bytes, int):
        within_budget = package_bytes <= BUDGET_BYTES

    asm_rules = z3_report.get("asm_rules") or {}
    greedy = z3_report.get("greedy") or {}
    required = z3_report.get("required") or {}

    state = {
        "meta": {
            "ndk_version": ndk_meta.get("ndk_version") or "unknown",
            "abi": "arm64-v8a",
            "host": "linux-x86_64",
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "source": ("github-actions"
                       if os.environ.get("CI") == "1"
                       or os.environ.get("GITHUB_ACTIONS") == "true"
                       else "local"),
        },
        "stages": {
            "fetch": {
                "zip_mb": mb(ndk_meta.get("zip_bytes")),
                "extracted_mb": mb(ndk_meta.get("extracted_bytes")),
            },
            "prune": {
                "before_mb": mb(prune.get("before_bytes")),
                "after_mb": mb(prune.get("after_bytes")),
                "removed_files": prune.get("removed_files"),
                "stripped_binaries": prune.get("stripped_binaries"),
            },
            "manifest": {
                "headers_total": totals.get("headers_total"),
                "headers_ok": totals.get("ok"),
                "headers_failed": totals.get("fail"),
                "asm_bytes_total": totals.get("asm_bytes_total"),
                "macros_total": totals.get("macros_total"),
                "asm_samples": manifest.get("asm_samples") or {},
            },
            "z3": {
                "solver": z3_report.get("solver"),
                "required_symbols": required.get("symbols") or [],
                "kept_files": len(z3_report.get("kept_files") or []) or None,
                "dropped_files": z3_report.get("dropped_files"),
                "bytes_total": z3_report.get("bytes_total"),
                "bytes_kept_mb": mb(z3_report.get("bytes_kept")),
                "bytes_saved_mb": mb(z3_report.get("bytes_saved")),
                "solve_ms": z3_report.get("solve_ms"),
                "greedy_kept_mb": mb(greedy.get("bytes_kept")),
                "asm_rules_verified": asm_rules.get("verified"),
                "asm_rules_occurrences": asm_rules.get("occurrences_total"),
                "asm_est_bytes_saved": asm_rules.get("est_bytes_saved"),
            },
            "pack": {
                "format": chosen.get("format"),
                "package_mb": mb(package_bytes),
                "tailored_mb": mb(tailored_bytes),
                "ratio": ratio,
                "budget_mb": 300,
                "within_budget": within_budget,
            },
            "verify": {
                "mode": verify.get("mode"),
                "projects": verify.get("projects") or [],
            },
        },
    }

    out_dir = os.path.dirname(os.path.abspath(args.out))
    os.makedirs(out_dir, exist_ok=True)
    with open(args.out, "w") as fh:
        json.dump(state, fh, indent=2, ensure_ascii=False)
    print(f"[merge_state] wrote {args.out}")


if __name__ == "__main__":
    main()
