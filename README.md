# ndk-nano

[![pipeline](https://github.com/abdallh-rgx/ndk-nano/actions/workflows/pipeline.yml/badge.svg)](https://github.com/abdallh-rgx/ndk-nano/actions/workflows/pipeline.yml)

المستودع / Repository: <https://github.com/abdallh-rgx/ndk-nano>

---

## الفكرة

يحوّل `ndk-nano` حزمة Android NDK r27c (نحو 2.2 حتى 2.9 غيغابايت بعد فك الضغط) — عبر خط إنتاج قابل للتكرار — إلى **حزمة مضغوطة أقل من 300 ميغابايت** قادرة على بناء مشاريع Android الأصلية للمعمارية `arm64-v8a` على مضيف `linux-x86_64`، ثم يوفّر "مُحمِّلاً" (loader) يستخرج الحزمة عند الطلب ويحاكي واجهات NDK المعتادة: `clang` و`clang++` و`ndk-build` ووسائط CMake.

ركيزتا المشروع:

1. **بصمة «ترويسة ← تمثيل تجميعي»**: لكل ترويسة من ترويسات الـ sysroot نصرّف وحدة ترجمة لا تحوي سوى `#include <الترويسة>` باستخدام مترجم `clang` المرفق بالـ NDK نفسه، ثم نسجّل بصمة ملف التجميع الناتج: الحجم بالبايت، وبصمة sha256، والرموز المعرّفة (`.globl`)، والرموز المستدعاة (`bl`).
2. **التصغير بحلّ Z3**: نستخدم محلل SMT ‏Z3 لأمرين منفصلين:
   - **تغطية مجموعات مرجّحة (weighted set-cover)**: اختيار أصغر مجموعة من ملفات المكتبات (بالمعايرة على الحجم بالبايت) تُشبع كل رموز الربط المطلوبة ومتطلبات الترويسات المستخرجة من بناءات حقيقية لمشاريع عينة.
   - **إثباتات تكافؤ على متجهات البت (BitVec(64))**: لكل قاعدة من قواعد إعادة كتابة التجميع (peephole) نُثبت أن التحويل محافظ على المعنى عبر إثبات أن نفي التكافؤ غير مُرضٍ (UNSAT)، ثم — وفقط بعد نجاح الإثبات — نطبّق القاعدة على نصوص التجميع المأخوذة كعيّنات.

تُكمِل ذلك آليات مُثبتة عملياً: تقليم الأشجار غير الضرورية مع نسخها بروابط صلبة (hardlinks)، وتجريد الثنائيات (`llvm-strip`)، وضغط حتمي (deterministic) بـ zstd وxz.

## النتائج

| المؤشر | القيمة |
| --- | --- |
| حجم الحزمة الكاملة (الأصغر بين zstd/xz) | «تُحدَّث تلقائياً بعد أول تشغيل» |
| نسبة الانكماش مقارنة بالشجرة المقلَّمة | «تُحدَّث تلقائياً بعد أول تشغيل» |
| عدد الملفات المحذوفة في مرحلة التقليم | «تُحدَّث تلقائياً بعد أول تشغيل» |
| عدد الثنائيات المُجرَّدة (strip) | «تُحدَّث تلقائياً بعد أول تشغيل» |
| عدد الترويسات المبصَّمة (manifest) | «تُحدَّث تلقائياً بعد أول تشغيل» |
| ملفات أبقاها Z3 / أسقطها (المكتبات) | «تُحدَّث تلقائياً بعد أول تشغيل» |
| الحجم الموفَّر بقرار Z3 (بايت) | «تُحدَّث تلقائياً بعد أول تشغيل» |
| حالة بناء عينات المشاريع (full / tailored) | «تُحدَّث تلقائياً بعد أول تشغيل» |

> تُكتَب هذه القيم آلياً في `data/pipeline-state.json` وتُلخَّص في `data/release-notes.md` بعد كل تشغيل لخط الإنتاج (انظر `pipeline/run_all.sh`). القيم أعلاه placeholders حتى أول تشغيل.

## المعمارية

```text
android-ndk-r27c-linux.zip (نحو 633MB)
        |
        v
[01_fetch.sh]  تنزيل + فك ضغط  ->  work/ndk  (نحو 2.5GB)
        |
        v
[02_prune.sh]  نسخ بروابط صلبة (cp -al) + تقليم ABIs غير arm64
        |       + حذف أدوات الأنظمة الأخرى + strip ثنائيات bin/
        |       ->  dist/ndk-nano            (لا نلمس work/ndk أبداً)
        v
[03_manifest.py]  بصمة كل ترويسة sysroot:  clang -Oz -S + -E -dM
        |          ->  data/manifest.json  (bytes/sha256/رموز/استدعاءات/متطلبات)
        v
[04_z3_minimize.py]  Z3 weighted set-cover على فهرس رموز nm
        |             + إثباتات BitVec(64) لقواعد peephole
        |             ->  data/z3_report.json + data/tailored-keep.txt
        v
[build_tailored.py]  dist/ndk-nano-tailored  (الشجرة المصغَّرة بقرار Z3)
        |
        v
[05_pack.sh]  tar حتمي + zstd/xz  ->  dist-pkg/ndk-nano-r27c-linux-arm64.tar.{zst,xz}
        |
        v
[run_all.sh]  تحقق: بناء العينات بالشجرتين (full + tailored)
        |       + حاجز الحجم <= 300MiB
        v
data/pipeline-state.json + data/release-notes.md  +  loader/ndk-nano
```

## مراحل خط الإنتاج

1. **الجلب — `pipeline/01_fetch.sh`**: تنزيل الأرشيف الرسمي (مع إمكانية الاستئناف)، التحقق من أن حجمه أكبر من 100MB، فكّ الضغط إلى `work/ndk`، ثم حذف الأرشيف بعد تسجيل حجمه في `work/meta.json`.
2. **التقليم — `pipeline/02_prune.sh`**: نسخة بروابط صلبة إلى `dist/ndk-nano` ثم: حذف مجلدات الأهداف غير `aarch64-linux-android` من الـ sysroot، وحذف مغلفات الأنظمة الأخرى من `bin/`، وحذف أشغال clang لمعماريّات أخرى، وحذف simpleperf/shaderc وغيرها، ثم تجريد ثنائيات `bin/` بـ `llvm-strip` المرفق (بالكتابة إلى ملف مؤقت ثم استبدال، ما يكسر الرابط الصلب ويُبقي الشجرة الأصلية سليمة). **لا نجرّد أبداً ملفات `.so` داخل الـ sysroot** لأنها كعبُات ربط (linker stubs) وجداول رموزها هي واجهة الربط نفسها.
3. **البصمة — `pipeline/03_manifest.py`**: لكل ترويسة: عدد وحدات الماكرو (`-E -dM`)، وبصمة التجميع (`-Oz -S`): الحجم وsha256 والرموز والاستدعاءات، مع تحليل علاقات `#include` لبناء رسم بياني للترويسات.
4. **التصغير بـ Z3 — `pipeline/04_z3_minimize.py`**: بناء فهرس رموز عبر `llvm-nm` لكل ملف مكتبة مرشّح، ثم حل مسألة التغطية المرجّحة بـ Z3 `Optimize` (مع مقارنة بحلّ جشِع greedy)، وإثبات قواعد إعادة كتابة التجميع على `BitVec(64)` وتطبيقها على العيّنات. الناتج: قائمة إبقاء `data/tailored-keep.txt` تُستخدم لبناء `dist/ndk-nano-tailored` عبر `pipeline/build_tailored.py`.
5. **التحزيم — `pipeline/05_pack.sh`**: أرشيف tar حتمي (`--sort=name --mtime=... --owner=0 --group=0`) مضغوط بـ zstd-19 و/أو xz-9e (مع بديل python-zstandard عند غياب أداة zstd).
6. **التحقق — `pipeline/run_all.sh`**: بناء عينتَي `samples/hello-jni` (C + C++/libc++/استثناءات/log) و`samples/mathlib` (libm) بالشجرة الكاملة ثم بالمصغَّرة، مع استخراج رموز الربط الفعلية غير المعرفة من ملفات `.o` الناتجة لتغذية مرحلة Z3 (إنشاء `data/usage.json`)، والتحقق من أن كل `.so` ناتج فعلاً بمعمارية AArch64 عبر `llvm-readelf`.

## لماذا Z3؟

- **تغطية المجموعات**: مسألة "أصغر مجموعة ملفات تُغطي مجموعة رموز مطلوبة" هي مسألة تحسين توافقيّ صعبة (NP-hard). صياغتها في Z3 ‏`Optimize` تعطينا حلاً معيارياً قابلاً للتفسير: حدٌّ أدنى مجردٌ لكل رمز مطلوب، ودالة هدف مجموعٌ مرجّح بالحجم بالكيلوبايت، مع إمكانية إضافة قيود لاحقة (رؤوس، ملفات مثبَّتة) دون إعادة كتابة الخوارزمية. نعرض دائماً مقارنة مع خوارزمية greedy التقليدية للشفافية.
- **إثباتات متجهات البت**: قواعد مثل حذف `add Xn, Xn, #0` ليست "مجرد أنماط نصية": لكل قاعدة نُثبت على مستوى الدلالة (`x + 0 == x` على `BitVec(64)`) أن نفي التكافؤ غير مُرضٍ، ولا تُطبَّق القاعدة إلا إذا نجح إثباتها. هذا هو المعنى الحرفي لعبارة "Z3 يقلّص التمثيل التجميعي".
- **الأمانة العلمية**: انظر القسم التالي.

## الاستخدام

```bash
# 1) تشغيل خط الإنتاج كاملاً (يحتاج نحو 6.5GB مساحة حرة)
bash pipeline/run_all.sh                  # NDK_VERSION=r27c افتراضياً

# 2) المُحمِّل: استخراج عند الطلب + محاكاة واجهات NDK
loader/ndk-nano setup                     # يستخرج أحدث حزمة إلى ~/.cache/ndk-nano/<version>
loader/ndk-nano clang --target=aarch64-linux-android24 -c foo.c -o foo.o
loader/ndk-nano clang++ --target=aarch64-linux-android24 -shared foo.o -o libfoo.so -llog
loader/ndk-nano path                      # يطبع مسار الشجرة المستخرجة
loader/ndk-nano cmake-args                # وسائط CMake الجاهزة
cmake -G Ninja ... $(loader/ndk-nano cmake-args) ../my-project
loader/ndk-nano ndk-build                 # من مجلد مشروع يحوي jni/Android.mk
eval "$(loader/ndk-nano env)"             # تصدير PATH وANDROID_NDK_HOME
loader/ndk-nano doctor                    # فحص صحة: أدوات الضغط، الحجم، clang، readelf

# 3) الاختبارات الذاتية (بدون تنزيل الـ NDK)
bash tests/run_tests.sh
```

متغيرات بيئة مفيدة: `NDK_VERSION`، `MAX_HEADERS` (تحديد عدد الترويسات المبصَّمة)، `SKIP_FETCH=1`، `PROFILE=minimal|standard`، `COMPRESS=both|zstd|xz`، `CI=1`، و`NDK_NANO_PKG` للمُحمِّل.

## حدود وأمانة علمية

**مُثبَت ومُتحقَّق منه آلياً في كل تشغيل**:

- التقليم والنسخ بالروابط الصلبة وتجريد الثنائيات: آليات قياسية، ونتائجها مقيسة (`data/metrics-prune.json`).
- الضغط الحتمي: مقيس (`data/metrics-pack.json`)، مع حاجز صارم 300MiB يُفشِل خط الإنتاج عند تجاوزه.
- حل Z3 للتغطية: حلٌّ مثالي صريح لمسألة الاختيار كما صُيغت (مع مقارنة greedy)، وكل رمز لا يجد مزوِّداً يُدرَج في `uncovered_symbols` بشفافية بدل إخفائه.
- إثباتات قواعد peephole: إثباتات رمزية فعلية على `BitVec(64)` لكل قاعدة قبل تطبيقها.

**تجريبي / عرضي (demonstration)**:

- تطبيق قواعد peephole على نصوص التجميع يُجرى على **عيّنات** البصمة فقط (بحد أقصى 6 نصوص)؛ الحالات المكتشفة في الشيفرات الواقعية نادرة أصلاً لأن المُحسِّنات الحديثة تحذفها مسبقاً، والتوفير التقديري (4 بايت لكل تعليمة AArch64 ثابتة العرض) تبسيطٌ مقصود. هذا مكوّن إثبات مفهوم لدائرة "إثبات ثم تطبيق"، وليس ادّعاء توفير حجم في الحزمة النهائية.
- اختيار الملفات بـ Z3 يعتمد على رموز الربط المستخرجة من **مشاريع العينة المرفقة**؛ توسيع تغطيته يحتاج توسيع مجموعة العينات، وقد أضفنا الملفات التي يضيفها مُصرِّف clang ضمنياً (`-lc -lm -ldl` و`crt*.o` وbuiltins) كتكلفة ثابتة لضمان صلاحية الشجرة المصغَّرة.

**قرارات هندسية موثَّقة** (التفاصيل في `docs/ARCHITECTURE.md`): ملفات الربط الضمنية تُعدَّل ثابتة، ومكتبات المضيف المشتركة أعلى `lib/` لا تُسقَط لأن clang نفسه يحتاجها للتشغيل، وأسماء ترويسات C++ تُحلَّ إلى `c++/v1/<name>` عند الحاجة.

## الترخيص

MIT — انظر [LICENSE](LICENSE).

---

# English

## The idea

`ndk-nano` turns the Android NDK r27c (~2.2-2.9 GB extracted) into a **compressed package under 300 MB** through a reproducible pipeline, while keeping the ability to build Android native projects for `arm64-v8a` on a `linux-x86_64` host. A loader script then extracts the package on demand and emulates the usual NDK interfaces: `clang`, `clang++`, `ndk-build`, and CMake toolchain arguments.

Two core concepts:

1. **Header-to-assembly fingerprint**: for every sysroot header we compile a translation unit containing only `#include <header>` with the NDK's own clang and record the resulting assembly fingerprint: size in bytes, sha256, defined symbols (`.globl`), and called symbols (`bl`).
2. **Z3 minimization**: the Z3 SMT solver is used for two independent jobs: (a) a **weighted set-cover** that selects the minimal (size-weighted) set of library files satisfying every link symbol and header requirement extracted from real sample builds, and (b) **BitVec(64) equivalence proofs** for assembly peephole rewrite rules, which are applied only after their proof succeeds.

These sit on top of proven mechanisms: hardlink-based tree pruning, binary stripping with the NDK's own `llvm-strip`, and deterministic zstd/xz compression.

## Results

| Metric | Value |
| --- | --- |
| Full package size (smallest of zstd/xz) | «auto-updated after the first run» |
| Shrink ratio vs pruned tree | «auto-updated after the first run» |
| Files removed by pruning | «auto-updated after the first run» |
| Stripped binaries | «auto-updated after the first run» |
| Headers fingerprinted | «auto-updated after the first run» |
| Z3 kept / dropped library files | «auto-updated after the first run» |
| Bytes saved by the Z3 decision | «auto-updated after the first run» |
| Sample build verification (full / tailored) | «auto-updated after the first run» |

> These values are written automatically to `data/pipeline-state.json` and summarized in `data/release-notes.md` on every pipeline run (`pipeline/run_all.sh`).

## Pipeline stages

1. **Fetch** (`pipeline/01_fetch.sh`) - resumable download of the official zip, sanity size check, extraction to `work/ndk`, zip deleted after recording its size in `work/meta.json`.
2. **Prune** (`pipeline/02_prune.sh`) - hardlink copy to `dist/ndk-nano`, remove non-arm64 sysroot triples, other-OS wrappers, non-aarch64 clang runtimes, simpleperf/shaderc etc., then strip `bin/` executables via `llvm-strip` writing to a temp file (breaks the hardlink, the pristine tree stays intact). Sysroot `.so` files are linker stubs and are **never** stripped.
3. **Manifest** (`pipeline/03_manifest.py`) - per header: macro count (`-E -dM`) and assembly fingerprint (`-Oz -S`): bytes, sha256, symbols, calls; plus the header's own `#include` relations.
4. **Z3 minimize** (`pipeline/04_z3_minimize.py`) - symbol index via `llvm-nm`, weighted set-cover with Z3 `Optimize` (with a greedy comparison), BitVec(64) proofs for peephole rules, emitting `data/tailored-keep.txt`; `pipeline/build_tailored.py` builds `dist/ndk-nano-tailored` from it.
5. **Pack** (`pipeline/05_pack.sh`) - deterministic tar compressed with zstd-19 and/or xz-9e (python-zstandard fallback when the zstd CLI is absent).
6. **Verify** (`pipeline/run_all.sh`) - build the `samples/hello-jni` and `samples/mathlib` projects with both the full and the tailored trees, extract the actually-undefined link symbols from the produced `.o` files into `data/usage.json` (feeding stage 4), and validate each `.so` is really AArch64 via `llvm-readelf`.

## Why Z3?

See the Arabic section above for the full formulation; in short: minimal file selection is an NP-hard combinatorial problem that we state declaratively in Z3 (one Or-constraint per required symbol, size-weighted objective, fixed files as constants), solved optimally and compared against a classical greedy heuristic. The peephole rules are not "just regexes": each rule is proved as a `BitVec(64)` equivalence (its negation is UNSAT) before it is allowed to touch any assembly text.

## Usage

```bash
bash pipeline/run_all.sh                  # full pipeline (needs ~6.5 GB free disk)

loader/ndk-nano setup
loader/ndk-nano clang --target=aarch64-linux-android24 -c foo.c -o foo.o
loader/ndk-nano ndk-build
cmake -G Ninja ... $(loader/ndk-nano cmake-args) ../my-project
loader/ndk-nano doctor

bash tests/run_tests.sh                   # self-contained tests, no NDK download
```

## Honesty and limits

Proven and automatically re-verified on every run: pruning/hardlinks/stripping, deterministic compression with a hard 300 MiB guard, the optimal Z3 set-cover solution for the stated problem (with transparent `uncovered_symbols` reporting), and the symbolic proofs of each peephole rule. Experimental / demonstration-grade: applying the peephole rules runs only on the sampled assembly texts (up to 6), and real-world occurrences of these patterns are rare because modern optimizers already delete them; the 4-bytes-per-instruction saving estimate is a deliberate simplification. Engineering decisions (implicit `-lc/-lm/-ldl` stubs and `crt*.o` kept as fixed cost, host shared libraries never dropped, C++ header aliasing) are documented in `docs/ARCHITECTURE.md`.

## License

MIT - see [LICENSE](LICENSE).
