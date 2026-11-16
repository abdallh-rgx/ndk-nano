#!/usr/bin/env bash
# Orchestrator for the ndk-nano pipeline.
#
#   01 fetch -> 02 prune -> verify(full) -> usage extraction ->
#   03 manifest -> 04 z3 minimize -> tailored tree -> 05 pack ->
#   verify(tailored) -> size guard -> pipeline-state.json + release notes.
#
# Env: NDK_VERSION=r27c, MAX_HEADERS=0, SKIP_FETCH=0, CI=0, JOBS=2,
#      PROFILE=minimal, COMPRESS=both.
set -euo pipefail

NDK_VERSION="${NDK_VERSION:-r27c}"
MAX_HEADERS="${MAX_HEADERS:-0}"
SKIP_FETCH="${SKIP_FETCH:-0}"
CI="${CI:-0}"
JOBS="${JOBS:-2}"

PIPE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PIPE_ROOT"

WORK="$PIPE_ROOT/work"
DATA="$PIPE_ROOT/data"
DIST="$PIPE_ROOT/dist"
TREE_FULL="$DIST/ndk-nano"
TREE_TAILORED="$DIST/ndk-nano-tailored"
LLVM_BIN_REL="toolchains/llvm/prebuilt/linux-x86_64/bin"

log() { echo "[run_all] $*"; }

mkdir -p "$DATA"

# ------------------------------------------------------------------ stage 1
if [ "$SKIP_FETCH" = "1" ]; then
  log "SKIP_FETCH=1: assuming $WORK/ndk already exists"
else
  NDK_VERSION="$NDK_VERSION" bash pipeline/01_fetch.sh
fi

# ------------------------------------------------------------------ stage 2
bash pipeline/02_prune.sh

# ----------------------------------------------------- verification helpers
if command -v cmake >/dev/null 2>&1 && command -v ninja >/dev/null 2>&1; then
  VERIFY_MODE="cmake"
else
  VERIFY_MODE="direct"
fi
log "verify mode: $VERIFY_MODE"

rm -f "$DATA/verify.json"
printf '{"mode": "%s", "projects": []}\n' "$VERIFY_MODE" > "$DATA/verify.json"

record_verify() {
  # record_verify <name> <status> <artifact> <machine> <tree-label>
  python3 - "$DATA/verify.json" "$1" "$2" "$3" "$4" "$5" <<'PYEOF'
import json
import sys

path, name, status, artifact, machine, tree = sys.argv[1:7]
try:
    with open(path) as fh:
        data = json.load(fh)
except Exception:
    data = {"mode": "direct", "projects": []}
projects = [p for p in data.get("projects", [])
            if not (p.get("name") == name and p.get("tree") == tree)]
projects.append({"name": name, "status": status, "artifact": artifact,
                 "machine": machine, "tree": tree})
data["projects"] = projects
with open(path, "w") as fh:
    json.dump(data, fh, indent=2)
PYEOF
}

verify_tree() {
  # verify_tree <tree-path> <label>
  local tree="$1" label="$2"
  local bin_dir="$tree/$LLVM_BIN_REL"
  local sample_dir name outdir artifact machine status
  for sample_dir in "$PIPE_ROOT"/samples/*/; do
    [ -d "$sample_dir" ] || continue
    name="$(basename "$sample_dir")"
    outdir="$WORK/verify/$label/$name"
    rm -rf "$outdir"
    mkdir -p "$outdir"
    artifact=""
    machine=""
    status="fail"
    log "verifying [$label] $name ..."
    if [ "$VERIFY_MODE" = "cmake" ]; then
      if cmake -S "$sample_dir" -B "$outdir" -G Ninja \
           -DCMAKE_TOOLCHAIN_FILE="$tree/build/cmake/android.toolchain.cmake" \
           -DANDROID_ABI=arm64-v8a \
           -DANDROID_PLATFORM=android-24 \
           -DANDROID_STL=c++_shared \
           >"$outdir/config.log" 2>&1 \
         && cmake --build "$outdir" >"$outdir/build.log" 2>&1; then
        artifact="$(find "$outdir" -name '*.so' -type f -print -quit || true)"
      else
        log "cmake build failed for $name (see $outdir/config.log / $outdir/build.log)"
      fi
    else
      if NDK_TREE="$tree" OUT_DIR="$outdir" bash "$sample_dir/build.sh" \
           >"$outdir/build.log" 2>&1; then
        artifact="$(find "$outdir" -name '*.so' -type f -print -quit || true)"
      else
        log "direct build failed for $name (see $outdir/build.log)"
      fi
    fi
    if [ -n "$artifact" ] && [ -f "$artifact" ]; then
      machine="$("$bin_dir/llvm-readelf" -h "$artifact" 2>/dev/null \
                 | awk '/^Machine:/{print $2, $3}' || true)"
      case "$machine" in
        *AArch64*) status="ok" ;;
        *) status="fail" ;;
      esac
    fi
    record_verify "$name" "$status" "$artifact" "$machine" "$label"
    log "verify [$label] $name: $status (machine: ${machine:-unknown})"
  done
}

# Build the samples with the FULL pruned tree, then extract the real link
# requirements (undefined symbols from the .o files + included headers).
verify_tree "$TREE_FULL" "full"

python3 - "$WORK/verify/full" "$DATA/usage.json" \
         "$TREE_FULL/$LLVM_BIN_REL/llvm-nm" "$PIPE_ROOT/samples" <<'PYEOF'
import json
import os
import re
import subprocess
import sys

verify_dir, out_path, nm_cmd, samples_dir = sys.argv[1:5]
include_re = re.compile(r'^\s*#\s*include\s*[<"]([^>"]+)[>"]', re.MULTILINE)

required = set()
objects = []
for root, dirs, files in os.walk(verify_dir):
    dirs.sort()
    for name in sorted(files):
        if not name.endswith(".o"):
            continue
        path = os.path.join(root, name)
        syms = []
        try:
            r = subprocess.run(
                [nm_cmd, "--undefined-only", "--format=posix", path],
                capture_output=True, text=True, timeout=60)
            for line in r.stdout.splitlines():
                parts = line.split()
                if not parts:
                    continue
                sym = parts[0]
                if re.match(r'^[A-Za-z_$]', sym) and not sym.startswith(".L"):
                    syms.append(sym)
        except Exception:
            pass
        syms = sorted(set(syms))
        objects.append({"path": os.path.relpath(path, verify_dir),
                        "undefined_symbols": syms})
        required.update(syms)

headers = set()
for root, dirs, files in os.walk(samples_dir):
    dirs.sort()
    for name in sorted(files):
        if not name.endswith((".c", ".cpp", ".cc", ".cxx", ".h")):
            continue
        try:
            with open(os.path.join(root, name), encoding="utf-8",
                      errors="replace") as fh:
                headers.update(include_re.findall(fh.read()))
        except OSError:
            continue

data = {"required_symbols": sorted(required),
        "required_headers": sorted(headers),
        "objects": objects}
os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
with open(out_path, "w") as fh:
    json.dump(data, fh, indent=2, ensure_ascii=False)
print(f"[run_all] usage.json: {len(required)} symbols, "
      f"{len(headers)} headers, {len(objects)} objects -> {out_path}")
PYEOF

# ------------------------------------------------------------------ stage 3
python3 pipeline/03_manifest.py --ndk "$WORK/ndk" --out "$DATA/manifest.json" \
        --jobs "$JOBS" --api 24 --max-headers "$MAX_HEADERS"

# ------------------------------------------------------------------ stage 4
python3 pipeline/04_z3_minimize.py \
        --manifest "$DATA/manifest.json" \
        --usage "$DATA/usage.json" \
        --sizes "$DATA/sizes.json" \
        --out "$DATA/z3_report.json" \
        --ndk "$WORK/ndk" \
        --root "$TREE_FULL" \
        --keep-list-out "$DATA/tailored-keep.txt"

# ------------------------------------------------------------ tailored tree
python3 pipeline/build_tailored.py --src "$TREE_FULL" --dst "$TREE_TAILORED" \
        --keep "$DATA/tailored-keep.txt"

# ------------------------------------------------------------------ stage 5
NDK_VERSION="$NDK_VERSION" bash pipeline/05_pack.sh

# -------------------------------------------------- verify the tailored tree
verify_tree "$TREE_TAILORED" "tailored"

# ----------------------------------------------------------- guards + state
verify_status=0
size_status=0

python3 - "$DATA/verify.json" <<'PYEOF' || verify_status=$?
import json
import sys

with open(sys.argv[1]) as fh:
    data = json.load(fh)
bad = [p for p in data.get("projects", []) if p.get("status") != "ok"]
if bad:
    detail = ", ".join(f"{p.get('name')}/{p.get('tree')}" for p in bad)
    print(f"VERIFY FAILED: {detail}")
    print("فشل التحقق: راجع السجلات في work/verify/")
    sys.exit(1)
print(f"VERIFY OK: {len(data.get('projects', []))} sample builds produced AArch64 artifacts")
PYEOF

python3 - "$DATA/metrics-pack.json" <<'PYEOF' || size_status=$?
import json
import sys

BUDGET = 314572800  # 300 MiB
with open(sys.argv[1]) as fh:
    data = json.load(fh)
chosen = (data or {}).get("chosen") or {}
size = chosen.get("bytes")
if not size:
    print("SIZE GUARD FAILED: no full package was produced")
    print("حاجز الحجم: لم تُنتَج حزمة كاملة")
    sys.exit(2)
if size > BUDGET:
    print(f"SIZE GUARD FAILED: {chosen['name']} is {size} bytes "
          f"({size / 1048576:.2f} MiB) > budget {BUDGET} bytes (300 MiB)")
    print("حاجز الحجم: الحزمة النهائية أكبر من 300 ميغابايت؛ "
          "راجع مرحلتَي التقليم والضغط")
    sys.exit(2)
print(f"SIZE GUARD OK: {chosen['name']} = {size} bytes "
      f"({size / 1048576:.2f} MiB) <= 300 MiB")
PYEOF

# State and release notes are always written, even when a guard failed,
# so the dashboard can show what happened.
python3 pipeline/merge_state.py --out "$DATA/pipeline-state.json"

python3 - "$DATA" "$WORK" <<'PYEOF'
import json
import os
import sys
from datetime import datetime, timezone

data_dir, work = sys.argv[1], sys.argv[2]

def load(name):
    try:
        with open(os.path.join(data_dir, name)) as fh:
            return json.load(fh)
    except Exception:
        return {}

state = load("pipeline-state.json")
prune = load("metrics-prune.json")
z3r = load("z3_report.json")
pack = load("metrics-pack.json")
man = load("manifest.json")

def mib(x):
    return f"{x / 1048576:.2f}"

lines = []
lines.append("# ndk-nano - ملاحظات إصدار آلية / Automated release notes")
lines.append("")
lines.append(f"Generated: {datetime.now(timezone.utc).isoformat()} | "
             f"NDK {state.get('meta', {}).get('ndk_version', 'unknown')} | "
             f"abi arm64-v8a | host linux-x86_64")
lines.append("")
lines.append("## المراحل / Stages")
lines.append("")
lines.append("| المرحلة | المؤشر | القيمة |")
lines.append("| --- | --- | --- |")
try:
    with open(os.path.join(work, "meta.json")) as fh:
        meta = json.load(fh)
except Exception:
    meta = {}
if meta.get("zip_bytes"):
    lines.append(f"| fetch | zip | {mib(meta['zip_bytes'])} MiB |")
if meta.get("extracted_bytes"):
    lines.append(f"| fetch | extracted | {mib(meta['extracted_bytes'])} MiB |")
if prune.get("before_bytes"):
    lines.append(f"| prune | before | {mib(prune['before_bytes'])} MiB |")
if prune.get("after_bytes"):
    lines.append(f"| prune | after | {mib(prune['after_bytes'])} MiB |")
if prune.get("removed_files") is not None:
    lines.append(f"| prune | removed files | {prune['removed_files']} |")
if prune.get("stripped_binaries") is not None:
    lines.append(f"| prune | stripped binaries | {prune['stripped_binaries']} |")
totals = man.get("totals") or {}
if totals:
    lines.append(f"| manifest | headers | {totals.get('headers_total')} "
                 f"(ok {totals.get('ok')}, failed {totals.get('fail')}) |")
    lines.append(f"| manifest | asm bytes total | {totals.get('asm_bytes_total')} |")
    lines.append(f"| manifest | macros total | {totals.get('macros_total')} |")
rules = z3r.get("asm_rules") or {}
if z3r:
    lines.append(f"| z3 | solver | {z3r.get('solver')} ({z3r.get('solve_ms')} ms) |")
    lines.append(f"| z3 | kept / dropped | {len(z3r.get('kept_files') or [])} / "
                 f"{z3r.get('dropped_files')} |")
    lines.append(f"| z3 | bytes saved | {z3r.get('bytes_saved')} B |")
    lines.append(f"| z3 | greedy comparison | {z3r.get('greedy', {}).get('bytes_kept')} B |")
    lines.append(f"| z3 | asm rules verified | {rules.get('verified')} "
                 f"({rules.get('occurrences_total')} occurrences) |")
chosen = pack.get("chosen") or {}
for f in pack.get("files") or []:
    lines.append(f"| pack | {f['name']} | {mib(f['bytes'])} MiB |")
if chosen:
    lines.append(f"| pack | chosen | {chosen['name']} ({chosen['format']}) |")
lines.append("")
lines.append("## التحقق / Verification")
lines.append("")
lines.append("| المشروع | الشجرة | الحالة | الآلة |")
lines.append("| --- | --- | --- | --- |")
for p in state.get("stages", {}).get("verify", {}).get("projects", []):
    lines.append(f"| {p.get('name')} | {p.get('tree')} | {p.get('status')} "
                 f"| {p.get('machine') or '-'} |")
lines.append("")
budget = state.get("stages", {}).get("pack", {})
lines.append("## الميزانية / Budget")
lines.append("")
lines.append(f"- within_budget: **{budget.get('within_budget')}** "
             f"(package {budget.get('package_mb')} MiB, budget 300 MiB)")
lines.append("")

out = os.path.join(data_dir, "release-notes.md")
with open(out, "w") as fh:
    fh.write("\n".join(lines) + "\n")
print(f"[run_all] wrote {out}")
PYEOF

if [ "$size_status" -ne 0 ]; then
  log "pipeline finished with SIZE GUARD failure"
  exit 2
fi
if [ "$verify_status" -ne 0 ]; then
  log "pipeline finished with VERIFY failure"
  exit 1
fi

# ---------------------------------------------------------- final summary
python3 - "$DATA/pipeline-state.json" <<'PYEOF'
import json
import sys

with open(sys.argv[1]) as fh:
    state = json.load(fh)
st = state.get("stages", {})
pack = st.get("pack", {}) or {}
z3s = st.get("z3", {}) or {}
ver = st.get("verify", {}) or {}
print("=====================================================")
print(" ndk-nano summary / الملخص النهائي")
print("=====================================================")
print(f" package      : {pack.get('package_mb')} MiB "
      f"({pack.get('format')}), budget 300 MiB, "
      f"within_budget={pack.get('within_budget')}")
if pack.get("tailored_mb") is not None:
    print(f" tailored pkg : {pack.get('tailored_mb')} MiB")
if pack.get("ratio") is not None:
    print(f" shrink ratio : {pack.get('ratio')}x vs pruned tree")
print(f" prune        : {st.get('prune', {}).get('before_mb')} MiB -> "
      f"{st.get('prune', {}).get('after_mb')} MiB "
      f"({st.get('prune', {}).get('removed_files')} files removed, "
      f"{st.get('prune', {}).get('stripped_binaries')} stripped)")
print(f" manifest     : {st.get('manifest', {}).get('headers_total')} headers "
      f"({st.get('manifest', {}).get('asm_bytes_total')} asm bytes)")
print(f" z3           : solver={z3s.get('solver')} kept={z3s.get('kept_files')} "
      f"dropped={z3s.get('dropped_files')} saved={z3s.get('bytes_saved_mb')} MiB "
      f"(greedy {z3s.get('greedy_kept_mb')} MiB), rules_verified="
      f"{z3s.get('asm_rules_verified')}")
for p in ver.get("projects", []):
    print(f" verify       : {p.get('name')}/{p.get('tree')} -> {p.get('status')} "
          f"({p.get('machine') or 'no machine info'})")
print("=====================================================")
PYEOF

log "ALL GREEN: pipeline finished successfully"
