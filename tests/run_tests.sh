#!/usr/bin/env bash
# Self-contained fixture tests for ndk-nano (no NDK download required).
# اختبارات ذاتية بالمثبتات فقط — لا تحتاج تنزيل الـ NDK.
#
# Covered / المغطى:
#   1. bash -n syntax check of every pipeline + loader shell script
#   2. python3 -m py_compile of every pipeline python module
#   3. pipeline/03_manifest.py on tests/fixtures/mini-ndk (NO-COMPILER mode)
#   4. pipeline/04_z3_minimize.py with tests/fake_nm.py as the nm stub
#   5. build_tailored.py: intentionally skipped (needs a real dist/ndk-nano)
#
# Usage: bash tests/run_tests.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PASS=0
FAIL=0
FAILURES=()

ok()  { echo "PASS: $*"; PASS=$((PASS + 1)); }
bad() { echo "FAIL: $*"; FAIL=$((FAIL + 1)); FAILURES+=("$*"); }
section() { echo; echo "=== $* ==="; }

# ---------------------------------------------------------------- 1. bash -n
section "1. shell syntax (bash -n)"
for f in pipeline/*.sh loader/*; do
  [ -f "$f" ] || continue
  if bash -n "$f"; then
    ok "bash -n $f"
  else
    bad "bash -n $f"
  fi
done

# ------------------------------------------------------------- 2. py_compile
section "2. python compile (py_compile)"
for f in pipeline/*.py; do
  [ -f "$f" ] || continue
  if python3 -m py_compile "$f"; then
    ok "py_compile $f"
  else
    bad "py_compile $f"
  fi
done

# ------------------------------------------- 3. 03_manifest.py (no_compiler)
section "3. 03_manifest.py on tests/fixtures/mini-ndk (no_compiler mode)"
rm -rf tests/out
mkdir -p tests/out
if python3 pipeline/03_manifest.py \
      --ndk tests/fixtures/mini-ndk \
      --out tests/out/manifest.json \
      --jobs 2 --api 24 \
      >tests/out/manifest.log 2>&1; then
  ok "03_manifest.py ran on tests/fixtures/mini-ndk"
else
  bad "03_manifest.py failed (see tests/out/manifest.log)"
fi

if [ -f tests/out/manifest.json ] && python3 - tests/out/manifest.json <<'PYEOF'
import json
import sys

with open(sys.argv[1]) as fh:
    m = json.load(fh)

assert m["meta"]["mode"] == "no_compiler", m["meta"]
totals = m["totals"]
assert totals["headers_total"] >= 4, totals
assert totals["no_compiler"] == totals["headers_total"], totals
assert totals["ok"] == 0 and totals["fail"] == 0, totals

hdrs = m["headers"]
for name in ("a.h", "b.h", "c.h", "log.h"):
    assert name in hdrs, sorted(hdrs)
assert hdrs["a.h"]["includes"] == ["b.h"], hdrs["a.h"]
assert hdrs["c.h"]["includes"] == ["sys/types.h"], hdrs["c.h"]
assert hdrs["log.h"]["includes"] == [], hdrs["log.h"]
for name, rec in hdrs.items():
    assert rec["status"] == "no_compiler", (name, rec)
    assert rec["asm_bytes"] is None and rec["asm_sha256"] is None, (name, rec)
assert m["asm_samples"] == {}, sorted(m["asm_samples"])

print(f"manifest OK: {totals['headers_total']} headers, mode=no_compiler, "
      f"a.h -> {hdrs['a.h']['includes']}")
PYEOF
then
  ok "manifest assertions (mode, totals, include graph)"
else
  bad "manifest assertions (see tests/out/manifest.json)"
fi

# ------------------------------------------------- 4. 04_z3_minimize.py + z3
section "4. 04_z3_minimize.py with the fake nm index"
if python3 pipeline/04_z3_minimize.py \
      --manifest tests/out/manifest.json \
      --usage tests/fixtures/usage.json \
      --sizes tests/fixtures/sizes.json \
      --nm-cmd tests/fake_nm.py \
      --out tests/out/z3_report.json \
      --ndk tests/fixtures/mini-ndk \
      --root tests/fixtures/mini-ndk \
      --keep-list-out tests/out/tailored-keep.txt \
      --rebuild-index \
      >tests/out/z3.log 2>&1; then
  ok "04_z3_minimize.py ran on the fixtures"
else
  bad "04_z3_minimize.py failed (see tests/out/z3.log)"
fi

if [ -f tests/out/z3_report.json ] && python3 - tests/out/z3_report.json \
      tests/out/tailored-keep.txt <<'PYEOF'
import json
import os
import sys

with open(sys.argv[1]) as fh:
    r = json.load(fh)

# Real schema emitted by 04_z3_minimize.py.
assert r["solver"] == "z3", f"solver is {r['solver']!r}, expected 'z3'"
assert r.get("z3_status") == "sat", r.get("z3_status")

kept = {os.path.basename(f["path"]) for f in r["kept_files"]}
# Every required symbol must have a kept provider:
assert "libfakec.a" in kept, kept            # memcpy, printf
assert "libfakelog.a" in kept, kept          # __android_log_print
assert kept & {"libfakecxx.a", "libfakecxx_shared.so"}, kept  # _Znwm, __cxa_throw
assert "libfakeunwind.a" in kept, kept       # _Unwind_Resume
assert r["uncovered_symbols"] == [], r["uncovered_symbols"]

assert r["bytes_saved"] > 0, r["bytes_saved"]
assert r["bytes_total"] > r["bytes_kept"] > 0, (r["bytes_total"], r["bytes_kept"])
assert r["greedy"]["bytes_kept"] > 0, r["greedy"]

rules = r["asm_rules"]
assert rules["verified"] is True, rules
assert len(rules["rules"]) == 5, rules["rules"]

with open(sys.argv[2]) as fh:
    keep = {os.path.basename(line.strip()) for line in fh if line.strip()}
assert "libfakelog.a" in keep and "crtbegin_dynamic.o" in keep, keep

print(f"z3 report OK: solver=z3 kept={sorted(kept)} "
      f"saved={r['bytes_saved']}B total={r['bytes_total']}B "
      f"greedy_kept={r['greedy']['bytes_kept']}B "
      f"asm_rules_verified={rules['verified']}")
PYEOF
then
  ok "z3 report assertions (solver, coverage, savings, proofs)"
else
  bad "z3 report assertions (see tests/out/z3_report.json)"
fi

# ------------------------------------------------ 5. build_tailored (skipped)
section "5. build_tailored.py on fixtures (skipped by design)"
echo "SKIP: build_tailored.py copies a real dist/ndk-nano tree; it is not run on fixtures."
ok "build_tailored.py intentionally skipped on fixtures"

# ------------------------------------------------------------------- summary
section "summary"
echo "passed: $PASS, failed: $FAIL"
if [ "$FAIL" -ne 0 ]; then
  echo
  echo "FAILED checks / اختبارات فاشلة:"
  for f in "${FAILURES[@]}"; do
    echo "  - $f"
  done
  exit 1
fi
echo "ALL FIXTURE TESTS GREEN / نجحت جميع اختبارات المثبتات"
