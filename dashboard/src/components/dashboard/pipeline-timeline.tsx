"use client";

import { motion } from "framer-motion";
import {
  BrainCircuit,
  Download,
  FileCode2,
  Package,
  Scissors,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { usePipeline } from "@/hooks/use-pipeline";
import { cn } from "@/lib/utils";

interface MetricDef {
  label: string;
  value: string | number | boolean | null;
  ltr?: boolean;
}

interface StageDef {
  file: string;
  title: string;
  icon: LucideIcon;
  desc: string;
  command: string;
  metrics: MetricDef[];
  done: boolean;
}

function fmtInt(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

function MetricChip({ metric }: { metric: MetricDef }) {
  const isBool = typeof metric.value === "boolean";
  return (
    <div className="inline-flex min-h-[44px] flex-col justify-center rounded-lg border border-zinc-800 bg-zinc-950/70 px-3 py-2">
      <span className="text-[11px] text-zinc-500">{metric.label}</span>
      {metric.value == null ? (
        <Skeleton className="mt-1 h-5 w-16 bg-zinc-800" />
      ) : isBool ? (
        <span
          className={cn(
            "text-sm font-bold",
            metric.value ? "text-emerald-400" : "text-rose-400"
          )}
          dir={metric.ltr ? "ltr" : undefined}
        >
          {metric.value ? "نعم" : "لا"}
        </span>
      ) : (
        <span
          className="font-mono text-sm font-bold text-zinc-100"
          dir={metric.ltr ? "ltr" : undefined}
        >
          {typeof metric.value === "number" ? fmtInt(metric.value) : metric.value}
        </span>
      )}
    </div>
  );
}

function CommandChip({ command }: { command: string }) {
  return (
    <div className="mt-4 overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-950" dir="ltr">
      <pre className="slim-scroll p-3 text-left font-mono text-xs leading-relaxed text-emerald-300/90">
        <code>{command}</code>
      </pre>
    </div>
  );
}

function StageStatusBadge({ done }: { done: boolean }) {
  return done ? (
    <Badge
      variant="outline"
      className="border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
    >
      منجزة
    </Badge>
  ) : (
    <Badge
      variant="outline"
      className="border-amber-400/40 bg-amber-400/10 text-amber-400"
    >
      بانتظار البيانات
    </Badge>
  );
}

function PipelineStageItem({ stage, index }: { stage: StageDef; index: number }) {
  const Icon = stage.icon;
  return (
    <AccordionItem
      value={stage.file}
      className="min-w-0 rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 transition-colors hover:border-zinc-700"
    >
      <AccordionTrigger className="min-h-[44px] py-4 hover:no-underline">
        <div className="flex flex-1 items-center gap-3 text-right">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-950 text-emerald-400">
            <Icon className="size-5" aria-hidden="true" />
          </span>
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-zinc-500" dir="ltr">
                {String(index + 1).padStart(2, "0")} — {stage.file}
              </span>
              <StageStatusBadge done={stage.done} />
            </div>
            <p className="mt-1 text-sm font-bold text-zinc-100 sm:text-base">
              {stage.title}
            </p>
          </div>
        </div>
      </AccordionTrigger>
      <AccordionContent>
        <p className="max-w-3xl text-sm leading-relaxed text-zinc-400">{stage.desc}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {stage.metrics.map((m) => (
            <MetricChip key={m.label} metric={m} />
          ))}
        </div>
        <CommandChip command={stage.command} />
      </AccordionContent>
    </AccordionItem>
  );
}

export function PipelineTimeline() {
  const { data, loading } = usePipeline();

  const s = data?.stages;
  const stages: StageDef[] = [
    {
      file: "01_fetch.sh",
      title: "تنزيل NDK الرسمي",
      icon: Download,
      desc: "تنزيل أرشيف الـ NDK الرسمي من Google وتفكيكه — نقطة البداية الثابتة لكل قياسات الحجم، ويُثبَّت إصدار الـ NDK والـ ABI والـ host في بيانات القياس.",
      command: "curl -fL -o ndk.zip \"$NDK_URL\" && unzip -q ndk.zip -d ndk/",
      done: !!(s?.fetch.zip_mb != null || s?.fetch.extracted_mb != null),
      metrics: [
        { label: "حجم الأرشيف (MB)", value: s?.fetch.zip_mb ?? null, ltr: true },
        { label: "بعد الفك (MB)", value: s?.fetch.extracted_mb ?? null, ltr: true },
      ],
    },
    {
      file: "02_prune.sh",
      title: "تقليم ABI واحد + strip عبر hardlinks",
      icon: Scissors,
      desc: "حذف كل ما لا يلزم لـ arm64-v8a (ABIs و shim و docs و samples)، ثم تقليص الثنائيات بـ strip --strip-all عبر hardlinks لتوفير المساحة دون نسخ مزدوجة.",
      command:
        "./02_prune.sh ndk/ pruned/ --abi arm64-v8a --api 24 --strip --hardlink",
      done: !!(s?.prune.after_mb != null || s?.prune.removed_files != null),
      metrics: [
        { label: "قبل التقليم (MB)", value: s?.prune.before_mb ?? null, ltr: true },
        { label: "بعد التقليم (MB)", value: s?.prune.after_mb ?? null, ltr: true },
        { label: "ملفات محذوفة", value: s?.prune.removed_files ?? null, ltr: true },
        { label: "ثنائيات strip", value: s?.prune.stripped_binaries ?? null, ltr: true },
      ],
    },
    {
      file: "03_manifest.py",
      title: "تمثيل كل header في Assembly: clang -Oz -S",
      icon: FileCode2,
      desc: "لكل header في الـ sysroot نترجم وحدة ترجمة تتضمنه بـ clang --target=aarch64-linux-android24 -Oz -S، ثم نأخذ بصمة الملف الناتج — فيصبح كل header ممثلاً بـ Assembly قابل للمقارنة والتصغير.",
      command:
        'clang --target=aarch64-linux-android24 -Oz -S -o tu_<header>.s -include <header> tu.c',
      done: s?.manifest.headers_total != null,
      metrics: [
        { label: "headers كلية", value: s?.manifest.headers_total ?? null, ltr: true },
        { label: "نجحت", value: s?.manifest.headers_ok ?? null, ltr: true },
        { label: "تعثرت", value: s?.manifest.headers_failed ?? null, ltr: true },
        { label: "بايتات asm", value: s?.manifest.asm_bytes_total ?? null, ltr: true },
        { label: "ماكرو مُعرّفة", value: s?.manifest.macros_total ?? null, ltr: true },
      ],
    },
    {
      file: "04_z3_minimize.py",
      title: "Z3 set-cover + قواعد peephole مُثبتة بتكافؤ bitvector",
      icon: BrainCircuit,
      desc: "نمذجة اختيار الملفات كمسألة set-cover مرجّحة ويحلها Z3 Optimize (MaxSAT/ILP) فيثبت الحد الأدنى الرياضي لحجم شجرة الإبقاء، مع قواعد peephole على الـ Assembly يُثبت صحتها بتكافؤ bitvector قبل حذف أي تعليمة.",
      command:
        "python3 04_z3_minimize.py manifest.json --solver z3 --prove-peephole --emit keep-list.txt",
      done: s?.z3.kept_files != null,
      metrics: [
        { label: "ملفات مُبقاة", value: s?.z3.kept_files ?? null, ltr: true },
        { label: "ملفات محذوفة", value: s?.z3.dropped_files ?? null, ltr: true },
        { label: "MB موفّرة", value: s?.z3.bytes_saved_mb ?? null, ltr: true },
        { label: "زمن الحل (ms)", value: s?.z3.solve_ms ?? null, ltr: true },
        { label: "قواعد peephole مُثبتة", value: s?.z3.asm_rules_verified ?? null, ltr: true },
        { label: "مرات تطبيق القواعد", value: s?.z3.asm_rules_occurrences ?? null, ltr: true },
      ],
    },
    {
      file: "05_pack.sh",
      title: "zstd -19 / xz -9e حتمي",
      icon: Package,
      desc: "تغليف شجرة الإبقاء بضغط حتمي (reproducible) بمستويات قصوى — zstd -19 أو xz -9e — مع حارس حجم في الـ CI يفشل البناء فور تجاوز 300MB، وحزم مخصصة أصغر لكل مشروع.",
      command:
        "tar -C keep-list/ -cf - . | zstd -19 -T0 --no-progress -o ndk-nano.tar.zst",
      done: s?.pack.package_mb != null,
      metrics: [
        { label: "الحزمة (MB)", value: s?.pack.package_mb ?? null, ltr: true },
        { label: "حزمة مخصصة (MB)", value: s?.pack.tailored_mb ?? null, ltr: true },
        { label: "النسبة (%)", value: s?.pack.ratio ?? null, ltr: true },
        { label: "الميزانية (MB)", value: s?.pack.budget_mb ?? 300, ltr: true },
        { label: "ضمن الميزانية", value: s?.pack.within_budget ?? null },
      ],
    },
    {
      file: "run_all.sh",
      title: "تحقق البناء الفعلي على مشاريع JNI",
      icon: ShieldCheck,
      desc: "تشغيل خط الإنتاج كاملاً ثم بناء مشاريع JNI حقيقية بالحزمة المصغرة عبر الـ loader، ومقارنة المخرجات ثنائياً (bit-identical artifacts) مع بناء الـ NDK الكامل.",
      command:
        "./run_all.sh --verify-projects samples/hello-jni samples/imgui-app --budget-mb 300",
      done: (s?.verify.projects?.length ?? 0) > 0,
      metrics: [
        { label: "نمط التحقق", value: s?.verify.mode ?? null, ltr: true },
        { label: "مشاريع مُبنية", value: s?.verify.projects?.length ?? null, ltr: true },
      ],
    },
  ];

  return (
    <section
      id="pipeline"
      className="scroll-mt-24 border-b border-zinc-800/80"
      aria-labelledby="pipeline-title"
    >
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4 }}
        >
          <h2
            id="pipeline-title"
            className="text-2xl font-extrabold text-zinc-50 sm:text-3xl"
          >
            خط الإنتاج
          </h2>
          <p className="mt-3 max-w-3xl leading-relaxed text-zinc-400">
            ست مراحل تعمل على GitHub Actions بترتيب صارم؛ القياسات الحقيقية تتدفق إلى هذه
            الصفحة تلقائياً بعد أول تشغيل كامل.{" "}
            {loading && <span className="text-zinc-500">جارٍ تحميل حالة المراحل…</span>}
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="mt-8"
        >
          <Accordion
            type="multiple"
            defaultValue={["01_fetch.sh", "03_manifest.py", "04_z3_minimize.py"]}
            className="grid grid-cols-1 gap-3"
          >
            {stages.map((stage, i) => (
              <PipelineStageItem key={stage.file} stage={stage} index={i} />
            ))}
          </Accordion>
        </motion.div>
      </div>
    </section>
  );
}
