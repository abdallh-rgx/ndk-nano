# ndk-nano — المعمارية الداخلية / Architecture

<div dir="rtl">

وثيقة معمارية تفصيلية ثنائية اللغة (العربية أولاً ثم الإنجليزية لكل قسم). المرجع التنفيذي لكل قسم هو الكود في `pipeline/`.

## 1. نظرة عامة

خط الإنتاج يحوّل NDK r27c إلى شجرتين (`dist/ndk-nano` مقلَّمة و`dist/ndk-nano-tailored` مصغَّرة بقرار Z3) ثم إلى حزم مضغوطة حتمية، مع تحقق بنائي حقيقي في كل تشغيل. كل المراحل تكتب مقاييسها إلى `data/*.json` وتُدمَج في `data/pipeline-state.json` (مخطط ثابت تستهلكه لوحة ويب خارجية — لا تُغيَّر أسماء المفاتيح).

</div>

## 1. Overview (English)

The pipeline turns NDK r27c into two trees (`dist/ndk-nano` pruned, `dist/ndk-nano-tailored` Z3-minimized) and then into deterministic compressed packages, with a real build verification on every run. Every stage writes metrics into `data/*.json`; `pipeline/merge_state.py` folds them into `data/pipeline-state.json` (a stable schema consumed by an external web dashboard - key names must not change).

<div dir="rtl">

## 2. المرحلة 1 — الجلب (`01_fetch.sh`)

- تنزيل مع استئناف: `curl -fL --retry 3 -C -`.
- فحص سلامة: حجم الأرشيف يجب أن يتجاوز 100MB وإلا نُفشِل المرحلة.
- فك الضغط ثم `mv work/android-ndk-r27c work/ndk` ثم **حذف الأرشيف** بعد تسجيل حجمه بالبايت.
- يُكتب `work/meta.json`: `{"ndk_version", "zip_bytes", "extracted_bytes"}` حيث `extracted_bytes` من `du -sb`.
- إن وُجد `work/ndk` سابقاً نتجاوز التنزيل (idempotent).

</div>

## 2. Stage 1 - fetch (`01_fetch.sh`) (English)

Resumable download (`curl -fL --retry 3 -C -`), a >100 MB size sanity check, extraction, rename to `work/ndk`, then the zip is deleted after its byte size is recorded into `work/meta.json` (`ndk_version`, `zip_bytes`, `extracted_bytes` from `du -sb`). The stage is idempotent: an existing `work/ndk` short-circuits it.

<div dir="rtl">

## 3. المرحلة 2 — التقليم (`02_prune.sh`)

**خدعة الروابط الصلبة**: `cp -al work/ndk dist/ndk-nano` ينشئ شجرة كاملة دون استهلاك مساحة إضافية (نفس الأنودات inode). كل حذف لاحق (`rm`) يزيل الاسم من الشجرة الجديدة فقط، والتجريد (strip) يُجرى بالكتابة إلى ملف مؤقت ثم `mv` — وهذا **يكسر الرابط الصلب** فيبقى الملف الأصلي في `work/ndk` سليماً بلا مسارات صلبة (symlinks) تُنسخ كما هي، وإن فشل `cp -al` (نظام ملفات آخر مثلاً) نسخنا نسخاً كاملة.

**ما يُحذَف** (بالاكتشاف بالنمط لا بالمسارات الثابتة):
- مجلدات ثلاثيات غير `aarch64-linux-android` تحت `sysroot/usr/lib` (arm/i686/x86_64...).
- مغلفات المترجم لثلاثيات غير مطلوبة ومن أنظمة أخرى (`*-windows-*`، `*-darwin-*`).
- أشغال clang لمعماريّات أخرى من `lib/clang/*/lib/linux/`؛ في `PROFILE=minimal` نبقي فقط `libclang_rt.builtins-aarch64-android.a` و`libclang_rt.profile*` (حذف sanitizers)، وفي `standard` نبقي كل ما هو aarch64.
- `simpleperf`، `shader-tools`، `prebuilt`، `sources/third_party/shaderc`، `gdbserver`.
- نبقي: `build/`، `meta/`، `ndk-build`، `source.properties`، `NOTICE`، كل README/LICENSE، و`sources/android/cpufeatures`.

**لماذا لا نجرّد كعبُات الـ sysroot؟** ملفات `.so` داخل `sysroot/usr/lib/aarch64-linux-android/` ليست مكتبات تنفيذية بل **كعبُات رابط** (linker stubs): جدول رموزها هو واجهة الربط نفسها؛ تجريدها يدمّر القدرة على الربط. لذلك نجرّد **حصراً** الملفات التنفيذية ELF تحت `toolchain/bin/`، وبتحقق من البادئة السحرية `\x7fELF`، وباستثناء الأرشيفات `.a`، وبأداة `llvm-strip` المرفقة بالـ NDK نفسه.

</div>

## 3. Stage 2 - prune (`02_prune.sh`) (English)

**The hardlink trick**: `cp -al work/ndk dist/ndk-nano` materializes a full tree at near-zero disk cost (same inodes). Later `rm` calls only unlink names in the new tree, and stripping writes to a temp file followed by `mv`, which **breaks the hardlink** - so the pristine `work/ndk` binary stays untouched. Symlinks are copied as symlinks; if `cp -al` fails (e.g. across filesystems) we fall back to `cp -a`.

**What is removed** (discovered by name patterns, never by hardcoded paths): non-arm64 triple directories under `sysroot/usr/lib`; non-kept-triple and other-OS compiler wrappers in `bin/`; non-aarch64 clang runtime objects in `lib/clang/*/lib/linux/` (in `PROFILE=minimal` only `libclang_rt.builtins-aarch64-android.a` and `libclang_rt.profile*` survive; `standard` keeps every aarch64 runtime); `simpleperf`, `shader-tools`, `prebuilt`, `sources/third_party/shaderc`, `gdbserver`. We keep `build/`, `meta/`, `ndk-build`, `source.properties`, `NOTICE`, every README/LICENSE, and `sources/android/cpufeatures`.

**Why stubs must not be stripped**: the `.so` files under `sysroot/usr/lib/aarch64-linux-android/` are linker stubs - their symbol table *is* the link interface. Stripping one destroys linking. Therefore we strip **only** ELF executables under `toolchain/bin/` (magic-byte check `\x7fELF`, never `.a` archives), using the NDK's own `llvm-strip`.

<div dir="rtl">

## 4. المرحلة 3 — بصمة الترويسات (`03_manifest.py`)

لكل ترويسة `h` (تُكتشف من `sysroot/usr/include`؛ ترويسات libc++ العامة في `c++/v1` تُصرَّف كـ C++17، والداخلية `__` تُتخطى وتُسجَّل في `skipped`):

```text
TU   :=  #include <h>
macros: clang --target=aarch64-linux-android<api> -x c|c++ -E -dM tu   -> عدد الأسطر
asm   : clang --target=aarch64-linux-android<api> -x c|c++ -std=c++17 -Oz -S -o tu.s tu
         -> asm_bytes, asm_sha256, symbols_defined = فريد ^\s*\.globl\s+(\S+)
                                calls = فريد \bbl\s+([A-Za-z_$][\w$.]*)
includes: تحليل الملف نفسه  ^\s*#\s*include\s*[<"]([^>"]+)[>"]
```

- مهلة زمنية 25 ثانية لكل استدعاء، وحالة لكل ترويسة: `ok` / `fail` (مع ذيل stderr حتى 200 حرف) / `no_compiler` (غياب clang: تُحلَّل العلاقات فقط، وتبقى حقول التجميع null — وهذا ما تختبره الاختبارات على `tests/fixtures/mini-ndk`).
- التوازي عبر ThreadPoolExecutor بعدد مهام `--jobs`.
- عيّنات `asm_samples` (حتى `--sample-asm`): بترتيب مفضَّل [jni.h, stdio.h, c++/v1/vector, math.h, android/log.h, string.h] ثم الأكبر حجماً، مع النص كاملاً حتى 6000 حرف.

</div>

## 4. Stage 3 - header manifest (`03_manifest.py`) (English)

For every header `h` discovered under `sysroot/usr/include` (public libc++ headers under `c++/v1` compile as C++17; internal `__`-prefixed names are skipped and recorded): we compile a TU containing only `#include <h>`, record the macro count (`-E -dM`) and the assembly fingerprint (`-Oz -S`: bytes, sha256, unique `.globl` symbols, unique `bl` calls), and parse the header's own `#include` directives to build the include graph. Per-call timeout is 25 s; per-header status is `ok` / `fail` (with a 200-char stderr tail) / `no_compiler` (no clang found: include relations still parsed, compiler fields null - exactly what the fixture tests exercise). Work is parallelized with a thread pool; `asm_samples` stores up to N full assembly texts (preferred headers first, then largest) for the peephole stage.

<div dir="rtl">

## 5. المرحلة 4 — التصغير بـ Z3 (`04_z3_minimize.py`)

### 5.1 مسألة تغطية المجموعات المرجّحة

المدخلات: `data/manifest.json` (رسم التضمينات)، `data/usage.json` (رموز الربط المطلوبة `R_syms` والترويسات المطلوبة `R_headers` المستخرجة من ملفات `.o` لعينات حقيقية)، و`data/sizes.json` (حجم كل ملف في `dist/ndk-nano`).

المرشّحون: كل `.so/.a/.o` تحت `sysroot/usr/lib/aarch64-linux-android` أو تحت `lib/` في سلسلة الأدوات (بحد 500 ملف، الأكبر أولاً).

نُصنّف المرشّحين إلى **قرار** (متغيّر منطقي `keep_f`) و**ثابت** (يُضاف دائماً كتكلفة ثابتة):

- `crt*.o` وأرشيف builtins — لازمان لأي ربط.
- كعبُات `libc.so` و`libm.so` و`libdl.so` — لأن مُصرِّف clang يضيف `-lc -lm -ldl` ضمنياً لهدف android، فإسقاطها يكسر أي ربط حتى لو لم تظهر رموزها في `usage.json`. (قرار هندسي موثَّق.)
- مكتبات المضيف المشتركة أعلى `toolchain/.../lib{,64}/` مباشرة — تبعيات تشغيل لثنائيات clang نفسها.
- إغلاق التضمينات المتعدي لكل ترويسة مطلوبة (الترويسات رخيصة وتُبقى كلها في الشجرة المصغَّرة أصلاً؛ هي هنا تكلفة ثابتة محاسبية).

الصياغة (على أعداد صحيحة بالكيلوبايت):

```text
لكل ملف قرار f:  keep_f : Bool
لكل رمز s في R_syms:  Or( keep_f  لأجل كل f يوفّر s )     [قيد تغطية]
تثبيت: keep_f = True ضمنياً لكل الثوابت (ليست متغيرات)
الهدف: minimize  Σ_f keep_f ? size_kb(f) : 0   +  Σ_(ثوابت وترويسات) size_kb
```

يُحَلّ عبر `z3.Optimize` مع مهلة زمنية؛ وإن تعذّر ذلك نرجع إلى خوارزمية greedy (نسبة تغطية/تكلفة) ونصرّح بذلك في التقرير (`solver: "greedy"`). الرمز الذي لا يجد أي مزوّد يُدرَج في `uncovered_symbols` ولا يُفشِل التشغيل — شفافية بدل التعقيد.

نقارن دائماً مع greedy في التقرير (`greedy.bytes_kept`) لبيان قيمة الحل الأمثل.

### 5.2 إثباتات متجهات البت لقواعد إعادة الكتابة

كل قاعدة تُصاغ كتكافؤ على `x : BitVec(64)` ويُثبَت أن نفيه UNSAT قبل أي تطبيق:

| القاعدة | التحويل | الصيغة المُثبَتة |
| --- | --- | --- |
| R1 | `add Xn, Xn, #0` ← حذف | `x + 0 == x` |
| R2 | `sub Xn, Xn, #0` ← حذف | `x - 0 == x` |
| R3 | `mov Xn, Xn` ← حذف | `x == x` |
| R4 | `and Xn, Xn, #-1` ← حذف | `x & 0xFFFF...F == x` |
| R5 | `orr Xn, Xn, #0` ← حذف | `x \| 0 == x` |

إن فشل إثبات أي قاعدة: `asm_rules.verified = false` ولا تُطبَّق القواعد إطلاقاً. عند النجاح تُطبَّق كأنماط سطرية على نصوص `asm_samples`، ويُحسَب التوفير التقديري 4 بايت لكل تعليمة محذوفة (تعليمات AArch64 ثابتة العرض 32 بت).

**أمانة**: هذا مكوّن إثبات-ثم-تطبيق على عيّنات؛ الحالات نادرة واقعياً لأن المُحسِّن يحذفها أصلاً. انظر README.

### 5.3 فهرس الرموز

لكل مرشّح: `nm --defined-only --format=posix <file>` (llvm-nm من الـ NDK، أو nm النظام، أو مُزوَّد خارجي عبر `--nm-cmd` كما في الاختبارات مع `tests/fake_nm.py`). يُخزَّن الفهرس في `symbol_index.json` بجوار المخرج ويُعاد استخدامه إلا مع `--rebuild-index`.

</div>

## 5. Stage 4 - Z3 minimization (`04_z3_minimize.py`) (English)

### 5.1 Weighted set cover

Inputs: the include graph (`data/manifest.json`), the link-symbol + header requirements extracted from real sample builds (`data/usage.json`), and per-file byte sizes (`data/sizes.json`). Candidates are all `.so/.a/.o` under `sysroot/usr/lib/aarch64-linux-android` or under the toolchain `lib/` tree (max 500, largest first). Candidates split into **decision** files (one Bool `keep_f` each) and **fixed** files (always kept, added as fixed cost): `crt*.o` and the builtins archive (needed by any link); the `libc.so` / `libm.so` / `libdl.so` stubs (the clang driver implicitly adds `-lc -lm -ldl` for android targets, so dropping them would break every link even though their symbols never show up in `usage.json` - documented engineering decision); host shared libraries directly under `toolchain/.../lib{,64}/` (runtime dependencies of the clang binaries); and the transitive include closure of every required header (headers are cheap; the tailored tree keeps all of them anyway - here they are accounting-level fixed cost).

Formulation (integer KB):

```text
for every decision file f:  keep_f : Bool
for every s in R_syms:      Or( keep_f for every f whose nm index provides s )
objective:  minimize  Σ_f (keep_f ? size_kb(f) : 0) + Σ_(fixed files and headers) size_kb
```

Solved with `z3.Optimize` under a timeout; on any solver failure we fall back to a coverage/cost greedy and say so in the report (`solver: "greedy"`). A required symbol with no provider at all is reported in `uncovered_symbols` instead of failing the run. The report always includes the greedy solution's bytes for comparison.

### 5.2 BitVec equivalence proofs for peephole rules

Each rule is stated as an equivalence over `x : BitVec(64)` and proved by checking that its negation is UNSAT before any application: R1 `x + 0 == x`, R2 `x - 0 == x`, R3 `x == x`, R4 `x & 0xFFFF...F == x`, R5 `x | 0 == x`. If any proof fails, `asm_rules.verified` becomes `false` and no rule is applied at all. On success the rules are applied as line-anchored regex passes over the sampled assembly texts, with an estimated saving of 4 bytes per deleted instruction (fixed 32-bit AArch64 encoding). This is a prove-then-apply demonstration on samples, not a claim about final package size.

### 5.3 Symbol index

For each candidate: `nm --defined-only --format=posix <file>` (the NDK's llvm-nm, else system nm, else an external `--nm-cmd` as used by the tests with `tests/fake_nm.py`). The index is cached as `symbol_index.json` next to the output and reused unless `--rebuild-index` is given.

<div dir="rtl">

## 6. الشجرة المصغَّرة (`build_tailored.py`)

نسخ بروابط صلبة (مع fallback إلى `copy2`) ثم حذف ما ليس في السياسة: تحت `sysroot/usr/lib/aarch64-linux-android` نبقي فقط الأسماء الأساسية في قائمة الإبقاء أو `crt*.o`؛ تحت `lib/` سلسلة الأدوات نبقي فقط مسارات قائمة الإبقاء (زائد builtins دائماً)؛ في `bin/` نبقي النواة (clang/clang++/lld/ld.lld/llvm-ar/llvm-nm/llvm-strip/llvm-readelf/llvm-ranlib/llvm-objcopy) ومغلفات `aarch64-linux-android*-clang*` **مع إغلاق أهداف symlinks** (فمثلاً `clang++` غالباً symlink إلى `clang`). تبقى دائماً: `ndk-build`، `build/`، `meta/`، كل الترويسات، وكل README/LICENSE/NOTICE. حذف أي ملف لا يمسّ `dist/ndk-nano` (روابط صلبة).

</div>

## 6. The tailored tree (`build_tailored.py`) (English)

Hardlink copy (fallback `copy2`), then policy deletion: under `sysroot/usr/lib/aarch64-linux-android` keep only keep-list basenames or `crt*.o`; under the toolchain `lib/` keep only keep-list paths (plus the builtins archive); in `bin/` keep the core tool set and `aarch64-linux-android*-clang*` wrappers **including their symlink closure** (`clang++` is usually a symlink to `clang`). Always kept: `ndk-build`, `build/`, `meta/`, every header, every README/LICENSE/NOTICE. Deletions never touch `dist/ndk-nano` itself (hardlinks).

<div dir="rtl">

## 7. التحزيم (`05_pack.sh`)

tar حتمي: `--sort=name --mtime='2025-01-01 00:00:00 UTC' --owner=0 --group=0 --numeric-owner -C dist -cf - ndk-nano` ثم zstd-`$ZSTD_LEVEL` (افتراضي 19) عبر أداة zstd إن وُجدت وإلا وحدة python-zstandard، و/أو xz-`$XZ_LEVEL` (افتراضي 9e). تُحزَم الشجرة المصغَّرة أيضاً بلاحقة `-tailored`. يُختار «الأصغر بين حزم الشجرة الكاملة» ويسجَّل في `data/metrics-pack.json`.

</div>

## 7. Packing (`05_pack.sh`) (English)

Deterministic tar (`--sort=name --mtime='2025-01-01 00:00:00 UTC' --owner=0 --group=0 --numeric-owner`) piped into zstd (CLI if present, else the python `zstandard` module) and/or xz. The tailored tree is packed with a `-tailored` suffix. The smallest full-tree package is recorded as `chosen` in `data/metrics-pack.json`.

<div dir="rtl">

## 8. التحقق واستخراج الاستخدام (`run_all.sh`)

- وضع التحقق: cmake+ninja إن توفّرا، وإلا بناء مباشر بسكربتات `build.sh` للعينات (clang/clang++ بهدف `aarch64-linux-android24`).
- بعد بناء الشجرة الكاملة: `llvm-nm --undefined-only --format=posix *.o` لكل ملفات `.o` الناتجة (مع ترشيح `^[A-Za-z_$]` واستبعاد `.L*`) + استخراج `#include <...>` من مصادر العينات ← `data/usage.json` الذي يغذّي مرحلة Z3. هكذا تكون متطلبات الربط مستخرجة من بناء حقيقي لا مكتوبة يدوياً.
- التحقق من كل `.so`: `llvm-readelf -h` يجب أن يحوي `Machine: AArch64`.
- إعادة التحقق نفسها على الشجرة المصغَّرة؛ فشل أي بناء = فشل خط الإنتاج.
- حاجز الحجم: الحزمة الكاملة المختارة ≤ 314572800 بايت (300MiB) وإلا خروج برمز 2.

</div>

## 8. Verification and usage extraction (`run_all.sh`) (English)

Verify mode is cmake+ninja when both exist, otherwise each sample's `build.sh` (direct clang/clang++ targeting `aarch64-linux-android24`). After the full-tree build, `llvm-nm --undefined-only --format=posix` runs over every produced `.o` (filtered to `^[A-Za-z_$]`, excluding `.L*`) plus `#include <...>` extraction from sample sources, producing `data/usage.json` - so the Z3 requirements come from a real build rather than a hand-written list. Every produced `.so` is checked with `llvm-readelf -h` for `Machine: AArch64`. The same verification runs against the tailored tree; any failing build fails the pipeline. The size guard enforces chosen full package <= 314572800 bytes (300 MiB), exiting with code 2 otherwise.

<div dir="rtl">

## 9. المُحمِّل (`loader/ndk-nano`)

- اكتشاف الحزمة: `$NDK_NANO_PKG` أو الأحدث في `dist-pkg/` (تفضيل الحزم الكاملة على `-tailored`).
- الاستخراج عند الطلب إلى `$NDK_NANO_HOME` أو `~/.cache/ndk-nano/<version>/` بشكل ذرّي (استخراج إلى `.tmp` ثم `mv`) مع ختم `.ready` والتحقق من وجود `ndk-build`.
- الأوامر: `setup` / `path` / `version` / `doctor` / `clang` / `clang++` / `ndk-build` / `cmake-args` / `env`. الضغط zstd عبر الأداة أو python-zstandard أو xz. رسائل خطأ ثنائية اللغة.

</div>

## 9. The loader (`loader/ndk-nano`) (English)

Package discovery: `$NDK_NANO_PKG` or the newest archive in `dist-pkg/` (full packages preferred over `-tailored`). On-demand atomic extraction (to a `.tmp` directory, then `mv`) into `$NDK_NANO_HOME` or `~/.cache/ndk-nano/<version>/` with a `.ready` stamp and an `ndk-build` existence check. Subcommands: `setup`, `path`, `version`, `doctor`, `clang`, `clang++`, `ndk-build`, `cmake-args`, `env`. Decompression uses the zstd CLI, the python `zstandard` module, or xz. Error messages are bilingual.

<div dir="rtl">

## 10. محاسبة الأحجام والمخطط الثابت

- الميغابايت في كل التقارير = MiB (1024^2)؛ الميزانية 300MiB = 314572800 بايت.
- `du -sb` للأشجار؛ `os.path.getsize` لملف الحزمة.
- `data/pipeline-state.json` (يُنتجه `merge_state.py` — مخطط ثابت لا يُغيَّر):

```json
{
  "meta": {"ndk_version": "...", "abi": "arm64-v8a", "host": "linux-x86_64",
            "generated_at": "...", "source": "local|github-actions"},
  "stages": {
    "fetch":   {"zip_mb": null, "extracted_mb": null},
    "prune":   {"before_mb": null, "after_mb": null, "removed_files": null, "stripped_binaries": null},
    "manifest":{"headers_total": null, "headers_ok": null, "headers_failed": null,
                "asm_bytes_total": null, "macros_total": null, "asm_samples": {}},
    "z3":      {"solver": null, "required_symbols": [], "kept_files": null, "dropped_files": null,
                "bytes_total": null, "bytes_kept_mb": null, "bytes_saved_mb": null, "solve_ms": null,
                "greedy_kept_mb": null, "asm_rules_verified": null, "asm_rules_occurrences": null,
                "asm_est_bytes_saved": null},
    "pack":    {"format": null, "package_mb": null, "tailored_mb": null, "ratio": null,
                "budget_mb": 300, "within_budget": null},
    "verify":  {"mode": null, "projects": []}
  }
}
```

- `ratio` = حجم الشجرة المقلَّمة (أو المستخرجة) ÷ حجم الحزمة المختارة، أي كم مرة تتقلّص الشجرة داخل الحزمة.

</div>

## 10. Size accounting and the stable schema (English)

All "MB" figures are MiB (1024^2); the budget is 300 MiB = 314572800 bytes. Tree sizes come from `du -sb`, package sizes from `os.path.getsize`. `data/pipeline-state.json` is emitted by `merge_state.py` with the exact schema shown above (Arabic section) - it is consumed by an external web dashboard, so key names are frozen. `ratio` = pruned-tree bytes (or extracted bytes) divided by the chosen package bytes, i.e. how many times the tree shrinks inside the package.

<div dir="rtl">

## 11. الانحرافات الهندسية عن المواصفة النصية (موثَّقة)

1. **تثبيت كعبُات `libc/libm/libdl` و`crt*.o` وbuiltins**: المواصفة الأصلية ذكرت `crt*.o` وbuiltins فقط؛ أضفنا كعبُات الربط الضمنية لأن مُصرِّف clang يمررها ضمنياً وإلا انكسر الربط في الشجرة المصغَّرة.
2. **مكتبات المضيف فوق `lib/` تُعدَّل ثابتة**: لأن ثنائيات clang تحتاجها للتشغيل (ليست مدخلات ربط).
3. **تفضيل الحزم الكاملة في المُحمِّل عند تساوي/تقارب التواريخ**: لأن الحزم المصغَّرة تُنشأ لاحقاً فميعادها أحدث.
4. **تحويل أسماء ترويسات C++**: `#include <vector>` يُحلَّ إلى `c++/v1/vector` عند مطابقة رسم التضمينات.
5. **فهرس الرموز يُخزَّن بجوار `--out`** وليس في `data/` دائماً، حتى تعمل الاختبارات بمعزل.
6. **`--root` في `04_z3_minimize.py`**: لتحويل المسارات النسبية من `sizes.json` إلى مسارات فعلية (افتراضي `dist/ndk-nano`).

</div>

## 11. Documented deviations from the literal spec (English)

1. Fixing the implicit `libc/libm/libdl` stubs (plus `crt*.o` and the builtins archive) as always-kept: the driver passes `-lc -lm -ldl` implicitly, so dropping them would break every tailored-tree link.
2. Host shared libraries directly under the toolchain `lib/` are fixed, never dropped: clang needs them to run (they are not link inputs).
3. The loader prefers full packages over `-tailored` ones when mtimes are close (tailored packages are produced later and would otherwise always win).
4. C++ header aliasing: `#include <vector>` resolves to `c++/v1/vector` against the manifest include graph.
5. The symbol index is stored next to `--out` (not always in `data/`) so tests stay isolated.
6. `04_z3_minimize.py` takes a `--root` argument (default `dist/ndk-nano`) to resolve `sizes.json` relative paths to real file paths.
