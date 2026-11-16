"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { FileCode2, FlaskConical, GitCompareArrows } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ASM_SAMPLES, type AsmSample } from "@/data/asm-samples";
import { usePipeline } from "@/hooks/use-pipeline";
import { AsmHighlightedLine } from "@/lib/asm-highlight";
import { cn } from "@/lib/utils";

interface ViewerSample {
  name: string;
  bytes: number;
  sha: string;
  text: string;
  minimizedText: string;
  removableLines: number[];
  isReal: boolean;
}

function toViewerSample(sample: AsmSample): ViewerSample {
  return {
    name: sample.name,
    bytes: sample.bytes,
    sha: sample.sha,
    text: sample.text,
    minimizedText: sample.minimizedText,
    removableLines: sample.removableLines,
    isReal: false,
  };
}

function AsmViewer({ sample }: { sample: ViewerSample }) {
  const [showMinimized, setShowMinimized] = useState(false);
  const lines = useMemo(() => sample.text.split("\n"), [sample.text]);
  const removableSet = useMemo(
    () => new Set(sample.removableLines),
    [sample.removableLines]
  );

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/70">
      {/* Viewer header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 px-4 py-3">
        <div className="flex items-center gap-2">
          <FileCode2 className="size-4 text-emerald-400" aria-hidden="true" />
          <span className="font-mono text-sm font-semibold text-zinc-100" dir="ltr">
            {sample.name}
          </span>
          <Badge variant="outline" className="border-zinc-700 bg-zinc-900 text-zinc-400">
            <span dir="ltr">sha: {sample.sha}</span>
          </Badge>
        </div>
        <label
          className="flex min-h-[44px] cursor-pointer items-center gap-2.5 text-sm text-zinc-300"
          aria-label="عرض ما بعد قواعد Z3"
        >
          <span>عرض ما بعد قواعد Z3</span>
          <Switch
            checked={showMinimized}
            onCheckedChange={setShowMinimized}
            aria-label="تفعيل عرض ما بعد قواعد Z3"
            className="data-[state=checked]:bg-emerald-500"
          />
        </label>
      </div>

      {/* Code block */}
      <div className="max-h-96 overflow-auto slim-scroll" dir="ltr">
        <pre className="min-w-max p-4 text-left font-mono text-xs leading-6">
          <code>
            {lines.map((line, i) => {
              const removed = removableSet.has(i) && showMinimized;
              return (
                <div
                  key={i}
                  className={cn(
                    "-mx-2 flex px-2",
                    removed && "rounded bg-rose-500/10"
                  )}
                >
                  <span className="w-8 shrink-0 select-none pe-3 text-right text-zinc-600">
                    {i + 1}
                  </span>
                  <span
                    className={cn(
                      "whitespace-pre",
                      removed && "text-rose-400/70 line-through decoration-rose-500/60"
                    )}
                  >
                    {line.length > 0 ? <AsmHighlightedLine line={line} /> : " "}
                  </span>
                </div>
              );
            })}
          </code>
        </pre>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-zinc-800 px-4 py-2 text-[11px] text-zinc-500">
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-sm bg-amber-300/70" />
          تعليمات
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-sm bg-emerald-400/70" />
          عناوين (labels)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-sm bg-zinc-500/70" />
          توجيهات (directives)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-sm bg-rose-300/70" />
          قيم فورية (#imm)
        </span>
        {showMinimized && (
          <span className="flex items-center gap-1.5">
            <span className="inline-block size-2.5 rounded-sm bg-rose-500/40" />
            أسطر تحذفها قواعد Z3 المُثبتة
          </span>
        )}
      </div>

      {/* Metrics row */}
      <div className="grid grid-cols-2 gap-px border-t border-zinc-800 bg-zinc-800 sm:grid-cols-4">
        <div className="bg-zinc-950/90 px-4 py-3">
          <p className="text-[11px] text-zinc-500">حجم الـ asm</p>
          <p className="font-mono text-sm font-bold text-zinc-100" dir="ltr">
            {sample.bytes.toLocaleString("en-US")} bytes
          </p>
        </div>
        <div className="bg-zinc-950/90 px-4 py-3">
          <p className="text-[11px] text-zinc-500">عدد الأسطر</p>
          <p className="font-mono text-sm font-bold text-zinc-100" dir="ltr">
            {lines.length}
          </p>
        </div>
        <div className="bg-zinc-950/90 px-4 py-3">
          <p className="text-[11px] text-zinc-500">بصمة الملف</p>
          <p className="font-mono text-sm font-bold text-zinc-100" dir="ltr">
            {sample.sha}
          </p>
        </div>
        <div className="bg-zinc-950/90 px-4 py-3">
          <p className="text-[11px] text-zinc-500">توفير Z3 (peephole)</p>
          <p className="font-mono text-sm font-bold text-emerald-400" dir="rtl">
            {sample.removableLines.length} تعليمة{" "}
            <span dir="ltr" className="text-zinc-400">
              (≈{sample.removableLines.length * 4} bytes)
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}

export function AssemblySection() {
  const { data } = usePipeline();

  const samples: ViewerSample[] = useMemo(() => {
    const real = data?.stages.manifest.asm_samples ?? {};
    return ASM_SAMPLES.map((preview) => {
      const entry = real[preview.name];
      if (
        entry &&
        typeof entry.text === "string" &&
        entry.text.length > 0 &&
        Array.isArray(entry.removable_lines)
      ) {
        return {
          name: preview.name,
          bytes: entry.bytes ?? preview.bytes,
          sha: entry.sha ?? preview.sha,
          text: entry.text,
          minimizedText: entry.minimized_text ?? entry.text,
          removableLines: entry.removable_lines,
          isReal: true,
        };
      }
      return toViewerSample(preview);
    });
  }, [data]);

  const hasReal = samples.some((s) => s.isReal);

  return (
    <section
      id="assembly"
      className="scroll-mt-24 border-b border-zinc-800/80"
      aria-labelledby="assembly-title"
    >
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4 }}
        >
          <h2
            id="assembly-title"
            className="text-2xl font-extrabold text-zinc-50 sm:text-3xl"
          >
            تمثيل الـ headers في Assembly
          </h2>
          <p className="mt-3 max-w-3xl leading-relaxed text-zinc-400">
            الفكرة الجوهرية: بدلاً من شحن ملفات headers كما هي، نترجم وحدة ترجمة تتضمن كل
            header إلى Assembly ونأخذ بصمة الناتج — تمثيل دقيق قابل للمقارنة، وقابل
            للتصغير بقواعد Z3 المُثبتة.
          </p>
        </motion.div>

        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Explanation card */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: 0.05 }}
            className="lg:col-span-1"
          >
            <Card className="h-full border-zinc-800 bg-zinc-900/40">
              <CardHeader>
                <CardTitle className="text-lg text-zinc-100">
                  كيف نمثل header في Assembly؟
                </CardTitle>
                <CardDescription className="text-zinc-400">
                  ثلاث خطوات حتمية لكل header في الـ sysroot:
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-3">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-emerald-500/15 font-mono text-xs font-bold text-emerald-400">
                    1
                  </span>
                  <p className="text-sm leading-relaxed text-zinc-300">
                    نترجم TU يتضمن الـ header بـ{" "}
                    <span className="font-mono text-xs text-amber-300" dir="ltr">
                      clang -Oz -S
                    </span>{" "}
                    على هدف{" "}
                    <span className="font-mono text-xs text-amber-300" dir="ltr">
                      aarch64-linux-android24
                    </span>
                    .
                  </p>
                </div>
                <div className="flex gap-3">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-emerald-500/15 font-mono text-xs font-bold text-emerald-400">
                    2
                  </span>
                  <p className="text-sm leading-relaxed text-zinc-300">
                    نحسب بصمة (fingerprint) الملف <span dir="ltr">.s</span> الناتج —
                    فتُصبح هوية الـ header قابلة للمقارنة بين الإصدارات.
                  </p>
                </div>
                <div className="flex gap-3">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-emerald-500/15 font-mono text-xs font-bold text-emerald-400">
                    3
                  </span>
                  <p className="text-sm leading-relaxed text-zinc-300">
                    قواعد peephole تحذف التعليمات الزائدة (مثل{" "}
                    <span className="font-mono text-xs text-amber-300" dir="ltr">
                      mov x0, x0
                    </span>
                    ) — وكل قاعدة يُثبت Z3 صحتها بتكافؤ bitvector قبل التطبيق.
                  </p>
                </div>
                {hasReal ? (
                  <Badge
                    variant="outline"
                    className="border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                  >
                    <GitCompareArrows className="size-3" aria-hidden="true" />
                    مخرجات clang فعلية من آخر تشغيل
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="border-amber-400/40 bg-amber-400/10 text-amber-400"
                  >
                    <FlaskConical className="size-3" aria-hidden="true" />
                    معاينة تمهيدية — ستُستبدل بمخرجات clang الفعلية
                  </Badge>
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* Tabs + viewer */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="lg:col-span-2"
          >
            <Tabs defaultValue={samples[0]?.name ?? "jni.h"}>
              <TabsList className="h-11 border border-zinc-800 bg-zinc-900/60 p-1">
                {samples.map((s) => (
                  <TabsTrigger
                    key={s.name}
                    value={s.name}
                    className="min-h-9 px-4 font-mono text-xs data-[state=active]:bg-zinc-800 data-[state=active]:text-emerald-400"
                  >
                    <span dir="ltr">{s.name}</span>
                  </TabsTrigger>
                ))}
              </TabsList>
              {samples.map((s) => (
                <TabsContent key={s.name} value={s.name} className="mt-4">
                  <AsmViewer sample={s} />
                </TabsContent>
              ))}
            </Tabs>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
