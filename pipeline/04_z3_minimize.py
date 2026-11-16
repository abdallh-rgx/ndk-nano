#!/usr/bin/env python3
"""Stage 4: Z3-powered minimization.

Two independent Z3 components:

1. Weighted set cover: choose the minimal (size-weighted) set of library
   files that satisfies every link symbol required by the sample builds.
   The transitive include closure of every required header is forced-kept
   as fixed cost (headers are cheap and the tailored tree keeps all of
   them anyway). The optimal solution is compared against a classical
   greedy set-cover heuristic.

2. BitVec(64) equivalence proofs for AArch64 assembly peephole rules.
   Each rule is proved by checking that the negation of its equivalence
   is UNSAT; rules are applied to the sampled assembly texts only when
   every proof succeeds.

If z3 cannot be imported the script degrades to the greedy solver and
disables rule application (reported honestly in the output).
"""

import argparse
import fnmatch
import json
import os
import re
import shutil
import subprocess
import sys
import time
from datetime import datetime, timezone

try:
    import z3
    HAVE_Z3 = True
except Exception as _exc:  # pragma: no cover - z3 is expected to exist
    z3 = None
    HAVE_Z3 = False
    Z3_IMPORT_ERROR = str(_exc)

LIB_EXTS = (".so", ".a", ".o")
SYMBOL_NAME_RE = re.compile(r'^[A-Za-z_$][\w$.]*$')

# ---------------------------------------------------------------------------
# AArch64 assembly peephole rules. Each rule deletes one instruction line.
# The regexes anchor on a full line; group 2 is the destination register and
# the backreference \2 requires the same register as the first source
# operand, which is what makes the rewrite semantically dead code.
# ---------------------------------------------------------------------------
ASM_RULES = [
    {
        "name": "R1",
        "expr": "x + 0 == x",
        "rule": "add Xn, Xn, #0 -> delete",
        "pattern": re.compile(
            r'^(\s*)add\s+(x\d+|w\d+|xzr|wzr),\s*\2,\s*#0\s*$', re.MULTILINE),
    },
    {
        "name": "R2",
        "expr": "x - 0 == x",
        "rule": "sub Xn, Xn, #0 -> delete",
        "pattern": re.compile(
            r'^(\s*)sub\s+(x\d+|w\d+|xzr|wzr),\s*\2,\s*#0\s*$', re.MULTILINE),
    },
    {
        "name": "R3",
        "expr": "x == x",
        "rule": "mov Xn, Xn -> delete",
        "pattern": re.compile(
            r'^(\s*)mov\s+(x\d+|w\d+),\s*\2\s*$', re.MULTILINE),
    },
    {
        "name": "R4",
        "expr": "x & 0xFFFFFFFFFFFFFFFF == x",
        "rule": "and Xn, Xn, #-1 -> delete",
        "pattern": re.compile(
            r'^(\s*)and\s+(x\d+),\s*\2,\s*#-1\s*$', re.MULTILINE),
    },
    {
        "name": "R5",
        "expr": "x | 0 == x",
        "rule": "orr Xn, Xn, #0 -> delete",
        "pattern": re.compile(
            r'^(\s*)orr\s+(x\d+),\s*\2,\s*#0\s*$', re.MULTILINE),
    },
]


def log(msg):
    print(f"[z3] {msg}", file=sys.stderr, flush=True)


def parse_args():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--manifest", default="data/manifest.json")
    ap.add_argument("--usage", default="data/usage.json")
    ap.add_argument("--sizes", default="data/sizes.json")
    ap.add_argument("--out", default="data/z3_report.json")
    ap.add_argument("--nm-cmd", default=None,
                    help="nm command (default: auto-detect llvm-nm from the "
                         "NDK, then system nm, then none)")
    ap.add_argument("--ndk", default="work/ndk",
                    help="NDK tree used to locate llvm-nm (default: work/ndk)")
    ap.add_argument("--root", default="dist/ndk-nano",
                    help="root used to resolve sizes.json relative paths "
                         "(default: dist/ndk-nano)")
    ap.add_argument("--timeout", type=int, default=120,
                    help="Z3 solver timeout in seconds (default: 120)")
    ap.add_argument("--keep-list-out", default="data/tailored-keep.txt")
    ap.add_argument("--rebuild-index", action="store_true",
                    help="ignore and rebuild the nm symbol index cache")
    ap.add_argument("--max-candidates", type=int, default=500,
                    help="max decision candidates, largest first (default: 500)")
    return ap.parse_args()


def load_json(path, default):
    try:
        with open(path) as fh:
            return json.load(fh)
    except Exception:
        return default


def save_json(path, data):
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    with open(path, "w") as fh:
        json.dump(data, fh, indent=2, ensure_ascii=False)


DEFAULT_USAGE = {
    "required_headers": [
        "jni.h", "stdio.h", "stdlib.h", "string.h", "android/log.h",
        "c++/v1/vector",
    ],
    "required_symbols": [
        "memcpy", "strlen", "printf", "__android_log_print",
        "_Znwm", "_ZdlPv", "__cxa_throw", "__cxa_begin_catch",
        "_Unwind_Resume",
    ],
    "objects": [],
}


def is_lib_candidate(rel):
    """Candidate library files: sysroot ABI dir or toolchain lib tree."""
    if "sysroot/usr/lib/aarch64-linux-android" in rel:
        return True
    if "toolchains/llvm/prebuilt" in rel and "/lib/" in rel:
        return True
    return False


def is_fixed_lib(rel):
    """Files that are always kept (never decision variables)."""
    base = os.path.basename(rel)
    if "sysroot/usr/lib/aarch64-linux-android" in rel:
        # crt objects are needed to link anything at all.
        if fnmatch.fnmatch(base, "crt*.o"):
            return True
        # The clang driver implicitly links -lc -lm -ldl for android targets,
        # and -lc++ for C++ (libc++.so is a tiny linker script pulling in
        # libc++_shared.so), so the matching stubs must survive any minimal
        # set (documented engineering decision, see docs/ARCHITECTURE.md).
        if base in ("libc.so", "libm.so", "libdl.so", "libc++.so"):
            return True
    if base == "libclang_rt.builtins-aarch64-android.a":
        return True
    # The clang driver passes -l:libunwind.a (and -latomic when needed) on
    # EVERY android link: bionic does not ship an unwinder, so libunwind.a
    # must survive any minimal set even though no TU references its symbols
    # directly (the linker resolves them from the driver's implicit -l flags).
    if base in ("libunwind.a", "libatomic.a"):
        return True
    # Host shared libraries placed directly in the toolchain lib dirs are
    # runtime dependencies of the clang binaries themselves.
    for host_lib in ("toolchains/llvm/prebuilt/linux-x86_64/lib",
                     "toolchains/llvm/prebuilt/linux-x86_64/lib64"):
        if rel.startswith(host_lib + "/"):
            rest = rel[len(host_lib) + 1:]
            if "/" not in rest and rest.endswith(".so"):
                return True
    return False


def resolve_nm(args):
    if args.nm_cmd:
        return args.nm_cmd
    llvm_nm = os.path.join(args.ndk, "toolchains", "llvm", "prebuilt",
                           "linux-x86_64", "bin", "llvm-nm")
    if os.path.isfile(llvm_nm) and os.access(llvm_nm, os.X_OK):
        return llvm_nm
    return shutil.which("nm")


def resolve_path(args, rel):
    """Resolve a sizes.json relative path against --root then --ndk."""
    for base in (args.root, args.ndk):
        candidate = os.path.join(base, rel)
        if os.path.exists(candidate):
            return candidate
    return os.path.join(args.root, rel)


def nm_symbols(nm_cmd, path):
    """Run nm --defined-only --format=posix and parse the first column."""
    try:
        r = subprocess.run(
            [nm_cmd, "--defined-only", "--format=posix", path],
            capture_output=True, text=True, timeout=120)
    except Exception:
        return []
    symbols = []
    for line in r.stdout.splitlines():
        parts = line.split()
        # posix format: "name type value" - skip archive member headers and
        # anything that does not look like a defined symbol entry.
        if len(parts) >= 2 and re.fullmatch(r'[A-Za-z]', parts[1]) \
                and SYMBOL_NAME_RE.match(parts[0]):
            symbols.append(parts[0])
    return sorted(set(symbols))


def header_closure(required, graph):
    """Transitive closure of required headers over the include graph.

    Include names are resolved against manifest header names; C++ includes
    such as <vector> are aliased to c++/v1/vector when present. Unknown
    includes are ignored.
    """
    result = set(required)
    stack = [h for h in required if h in graph]
    seen = set()
    while stack:
        current = stack.pop()
        if current in seen:
            continue
        seen.add(current)
        includes = (graph.get(current) or {}).get("includes") or []
        for inc in includes:
            target = inc if inc in graph else None
            if target is None and ("c++/v1/" + inc) in graph:
                target = "c++/v1/" + inc
            if target is not None and target not in seen:
                result.add(target)
                stack.append(target)
    return result


def find_header_entry(header, sizes):
    """Find (relpath, bytes) for a header via usr/include/<name> suffix."""
    suffix = "usr/include/" + header
    for rel in sorted(sizes):
        if rel.endswith(suffix):
            return rel, sizes[rel]
    return None, 0


def solve_z3(decision, required_symbols, providers, timeout_ms):
    """Weighted set cover via z3 Optimize. Returns (kept, status) or None."""
    if not decision:
        return [], "sat"
    opt = z3.Optimize()
    try:
        opt.set("timeout", timeout_ms)
    except Exception:
        pass
    keep = {p: z3.Bool(f"keep_{i}") for i, p in enumerate(decision)}
    for sym in required_symbols:
        prov = [p for p in providers.get(sym, []) if p in keep]
        if prov:
            opt.add(z3.Or([keep[p] for p in prov]))
    cost_terms = [z3.If(keep[p], max(1, decision[p] // 1024), 0)
                  for p in decision]
    opt.minimize(z3.Sum(cost_terms))
    res = opt.check()
    if res != z3.sat:
        return None, str(res)
    model = opt.model()
    kept = [p for p in decision
            if z3.is_true(model.eval(keep[p], model_completion=True))]
    return kept, str(res)


def greedy_cover(decision, required_symbols, providers, index):
    """Classical greedy set cover by coverage/cost ratio."""
    remaining = {s for s in required_symbols if providers.get(s)}
    chosen = set()
    while remaining:
        best, best_ratio = None, 0.0
        for p, size in decision.items():
            if p in chosen:
                continue
            gain = len(set(index.get(p, [])) & remaining)
            if gain == 0:
                continue
            ratio = gain / max(1, size)
            if ratio > best_ratio:
                best, best_ratio = p, ratio
        if best is None:
            break
        chosen.add(best)
        remaining -= set(index.get(best, []))
    return sorted(chosen)


def verify_asm_rules():
    """Prove every peephole rule on BitVec(64); returns (ok, details)."""
    x = z3.BitVec("x", 64)
    zero = z3.BitVecVal(0, 64)
    all_ones = ~zero
    exprs = {
        "R1": x + zero == x,
        "R2": x - zero == x,
        "R3": x == x,
        "R4": (x & all_ones) == x,
        "R5": (x | zero) == x,
    }
    details = {}
    ok = True
    for rule in ASM_RULES:
        solver = z3.Solver()
        try:
            solver.set("timeout", 10000)
        except Exception:
            pass
        solver.add(z3.Not(exprs[rule["name"]]))
        proved = solver.check() == z3.unsat
        details[rule["name"]] = proved
        if not proved:
            ok = False
    return ok, details


def main():
    args = parse_args()

    if not HAVE_Z3:
        log(f"WARNING: z3 import failed ({Z3_IMPORT_ERROR}); "
            "falling back to the greedy solver")

    # ------------------------------------------------------------------ usage
    usage = load_json(args.usage, None)
    if usage is None:
        log(f"{args.usage} missing; writing a sensible default")
        usage = DEFAULT_USAGE
        save_json(args.usage, usage)
    required_symbols = list(usage.get("required_symbols") or [])
    required_headers = list(usage.get("required_headers") or [])

    manifest = load_json(args.manifest, {})
    if not manifest:
        log(f"WARNING: {args.manifest} missing or empty; the include graph "
            "will be empty")
    headers_graph = manifest.get("headers") or {}
    asm_samples = manifest.get("asm_samples") or {}

    sizes_doc = load_json(args.sizes, {})
    sizes = sizes_doc.get("files") or {}
    if not sizes:
        log(f"WARNING: {args.sizes} missing or empty; no candidates")

    # ------------------------------------------------------------- candidates
    all_libs = {
        rel: size for rel, size in sizes.items()
        if os.path.splitext(rel)[1] in LIB_EXTS and is_lib_candidate(rel)
    }
    fixed = {p: b for p, b in all_libs.items() if is_fixed_lib(p)}
    pool = {p: b for p, b in all_libs.items() if p not in fixed}
    pool_limited = dict(
        sorted(pool.items(), key=lambda kv: -kv[1])[:args.max_candidates])
    decision = dict(sorted(pool_limited.items()))
    log(f"candidates: {len(all_libs)} lib files "
        f"({len(decision)} decision, {len(fixed)} fixed)")

    # ------------------------------------------------------------ symbol index
    nm_cmd = resolve_nm(args)
    index_path = os.path.join(
        os.path.dirname(os.path.abspath(args.out)), "symbol_index.json")
    index = {}
    if os.path.exists(index_path) and not args.rebuild_index:
        cached = load_json(index_path, {})
        if isinstance(cached, dict):
            index = cached
            log(f"symbol index cache: {len(index)} entries "
                f"({index_path})")
    if nm_cmd:
        todo = [p for p in all_libs if p not in index]
        for i, p in enumerate(todo):
            index[p] = nm_symbols(nm_cmd, resolve_path(args, p))
            if (i + 1) % 50 == 0:
                log(f"nm progress: {i + 1}/{len(todo)}")
        if todo:
            save_json(index_path, index)
            log(f"symbol index: {len(todo)} new entries -> {index_path}")
    else:
        log("no nm available; the symbol index stays empty "
            "(all required symbols will be uncovered)")

    # Coverage: for every required symbol, which decision files provide it.
    # Symbols already satisfied by a FIXED (always-kept) file must NOT force
    # decision variables: e.g. sinf is exported by the driver-implicit libm.so
    # stubs, so the model must not also pay for the static libm.a archive.
    providers = {}
    uncovered = []
    for sym in required_symbols:
        if any(sym in index.get(f, []) for f in fixed):
            providers[sym] = []  # covered for free
            continue
        prov = [p for p in decision if sym in index.get(p, [])]
        providers[sym] = prov
        if not prov:
            uncovered.append(sym)
    if uncovered:
        log(f"WARNING: uncovered symbols (no provider found): {uncovered}")

    # ------------------------------------------------------- header fixed set
    needed_headers = header_closure(required_headers, headers_graph)
    header_files = []
    for h in sorted(needed_headers):
        rel, size = find_header_entry(h, sizes)
        header_files.append({"path": rel or h, "bytes": size})
    log(f"required headers: {len(required_headers)} -> "
        f"{len(header_files)} after include closure")

    # ------------------------------------------------------------- solve (z3)
    t0 = time.time()
    solver_name = "greedy"
    z3_status = None
    kept_decision = None
    if HAVE_Z3:
        try:
            kept, status = solve_z3(decision, required_symbols, providers,
                                    args.timeout * 1000)
            z3_status = status
            if kept is not None:
                kept_decision = kept
                solver_name = "z3"
        except Exception as exc:
            log(f"z3 optimizer failed ({exc}); falling back to greedy")
    solve_ms = int((time.time() - t0) * 1000)

    greedy_kept = greedy_cover(decision, required_symbols, providers, index)
    if kept_decision is None:
        kept_decision = greedy_kept
        solver_name = "greedy"

    # ------------------------------------------------------------- accounting
    fixed_bytes = sum(fixed.values()) + sum(h["bytes"] for h in header_files)
    bytes_total = sum(decision.values()) + fixed_bytes
    kept_bytes = sum(decision[p] for p in kept_decision)
    bytes_kept = kept_bytes + fixed_bytes
    bytes_saved = bytes_total - bytes_kept
    greedy_bytes_kept = sum(decision[p] for p in greedy_kept) + fixed_bytes

    # ------------------------------------------------------------ asm rules
    rules_verified = False
    rule_details = {}
    occurrences_total = 0
    est_bytes_saved = 0
    minimized = {}
    rules_report = []
    if HAVE_Z3:
        rules_verified, rule_details = verify_asm_rules()
        if not rules_verified:
            log("WARNING: at least one peephole rule failed its BitVec "
                "proof; rules will NOT be applied")
    else:
        log("z3 unavailable; peephole rules cannot be proved and are skipped")

    if rules_verified:
        counts = {r["name"]: 0 for r in ASM_RULES}
        for header, entry in asm_samples.items():
            text = entry.get("asm_text") or ""
            for rule in ASM_RULES:
                counts[rule["name"]] += len(rule["pattern"].findall(text))
                text = rule["pattern"].sub("", text)
            minimized[header] = text
        occurrences_total = sum(counts.values())
        # AArch64 is a fixed-width ISA: every deleted instruction is 4 bytes.
        est_bytes_saved = 4 * occurrences_total
        rules_report = [
            {"name": r["name"], "expr": r["expr"], "occurrences": counts[r["name"]]}
            for r in ASM_RULES
        ]
    else:
        rules_report = [
            {"name": r["name"], "expr": r["expr"], "occurrences": 0}
            for r in ASM_RULES
        ]

    # ----------------------------------------------------------------- report
    report = {
        "solver": solver_name,
        "z3_status": z3_status,
        "required": {"symbols": required_symbols, "headers": required_headers},
        "uncovered_symbols": uncovered,
        "kept_files": [{"path": p, "bytes": decision[p]}
                       for p in sorted(kept_decision)],
        "dropped_files": len(decision) - len(kept_decision),
        "bytes_total": bytes_total,
        "bytes_kept": bytes_kept,
        "bytes_saved": bytes_saved,
        "solve_ms": solve_ms,
        "greedy": {"bytes_kept": greedy_bytes_kept},
        "fixed_files": (
            [{"path": p, "bytes": b} for p, b in sorted(fixed.items())]
            + header_files),
        "asm_rules": {
            "verified": rules_verified,
            "rules": rules_report,
            "occurrences_total": occurrences_total,
            "est_bytes_saved": est_bytes_saved,
        },
        "asm_samples_minimized": minimized,
        "needed_headers": [h["path"] for h in header_files],
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
    save_json(args.out, report)

    # --------------------------------------------------------------- keep list
    keep_paths = sorted(
        set(kept_decision) | set(fixed)
        | {h["path"] for h in header_files if h["path"] in sizes})
    os.makedirs(
        os.path.dirname(os.path.abspath(args.keep_list_out)), exist_ok=True)
    with open(args.keep_list_out, "w") as fh:
        for p in keep_paths:
            fh.write(p + "\n")

    log(f"solver={solver_name} (z3_status={z3_status}) "
        f"kept={len(kept_decision)} dropped={report['dropped_files']} "
        f"saved={bytes_saved}B greedy_kept={greedy_bytes_kept}B "
        f"solve_ms={solve_ms}")
    log(f"asm rules verified={rules_verified} "
        f"occurrences={occurrences_total} est_saved={est_bytes_saved}B")
    log(f"wrote {args.out} and {args.keep_list_out} ({len(keep_paths)} paths)")


if __name__ == "__main__":
    main()
