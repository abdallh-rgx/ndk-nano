#!/usr/bin/env python3
"""Stub ``nm`` replacement for the ndk-nano fixture tests.

Used via ``pipeline/04_z3_minimize.py --nm-cmd tests/fake_nm.py``. Flags such
as ``--defined-only`` / ``--format=posix`` are accepted and ignored; every
remaining argument is treated as a file path. Known fixture basenames get a
canned posix-format symbol table (``NAME T 0000000000000000``); unknown files
produce no output and exit 0 (like an empty archive).
"""

import os
import sys

SYMBOLS = {
    "libfakec.a": [
        "memcpy",
        "strlen",
        "printf",
        "malloc",
    ],
    "libfakelog.a": [
        "__android_log_print",
        "__android_log_write",
    ],
    "libfakecxx.a": [
        "_Znwm",
        "_ZdlPv",
        "__cxa_throw",
        "__cxa_begin_catch",
    ],
    "libfakecxx_shared.so": [
        "_Znwm",
        "_ZdlPv",
        "__cxa_throw",
        "__cxa_begin_catch",
        "_ZNSt6vectorIiSaIiEE9push_backERKi",
    ],
    "libfakeunwind.a": [
        "_Unwind_Resume",
        "_Unwind_Backtrace",
    ],
    "crtbegin_dynamic.o": [
        "__dso_handle",
    ],
}


def main(argv):
    paths = [arg for arg in argv[1:] if not arg.startswith("-")]
    for path in paths:
        for sym in SYMBOLS.get(os.path.basename(path), []):
            print(f"{sym} T 0000000000000000")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
