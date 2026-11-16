"use client";

import { motion } from "framer-motion";
import { ArrowDown, FileX2, Github, Package2, Percent, Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { usePipeline } from "@/hooks/use-pipeline";
import { useCountUp } from "@/hooks/use-count-up";
import { GH_REPO_URL } from "@/lib/gh";

const ORIGINAL_MB_FALLBACK = 2900;
const BUDGET_MB = 300;

function fmtInt(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

function KpiCard({
  icon,
  label,
  value,
  suffix,
  pendingText,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | null;
  suffix: string;
  pendingText: string;
}) {
  const animated = useCountUp(value);
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
      <div className="flex items-center gap-2 text-zinc-400">
        {icon}
        <span className="text-sm font-medium">{label}</span>
      </div>
      <div className="mt-3 flex min-h-10 items-end" dir="ltr">
        {value == null ? (
          <div className="w-full">
            <Skeleton className="h-8 w-24 bg-zinc-800" />
            <p className="mt-2 font-sans text-xs text-amber-400" dir="rtl">
              {pendingText}
            </p>
          </div>
        ) : (
          <p className="font-mono text-3xl font-bold text-zinc-50">
            {fmtInt(animated ?? 0)}
            <span className="ms-1 text-sm font-medium text-zinc-400">{suffix}</span>
          </p>
        )}
      </div>
    </div>
  );
}

export function Hero() {
  const { data, loading } = usePipeline();

  const originalMb = data?.stages.fetch.extracted_mb ?? null;
  const packageMb = data?.stages.pack.package_mb ?? null;
  const ratio = data?.stages.pack.ratio ?? null;
  const removedFiles = data?.stages.prune.removed_files ?? null;

  const originalForBar = originalMb ?? ORIGINAL_MB_FALLBACK;
  const packageForBar = packageMb ?? BUDGET_MB;
  const packagePct = Math.max(
    2,
    Math.min(100, (packageForBar / originalForBar) * 100)
  );
  const isPending = packageMb == null;

  return (
    <section
      id="idea"
      className="scroll-mt-24 border-b border-zinc-800/80 bg-gradient-to-b from-zinc-900/40 via-zinc-950 to-zinc-950"
      aria-labelledby="hero-title"
    >
      <div className="mx-auto max-w-6xl px-4 pb-14 pt-14 sm:px-6 sm:pt-20">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4 }}
        >
          <Badge
            variant="outline"
            className="mb-5 border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
          >
            Android NDK r27c — arm64-v8a — مفتوح المصدر
          </Badge>
          <h1
            id="hero-title"
            className="max-w-3xl text-balance text-4xl font-extrabold leading-[1.2] text-zinc-50 sm:text-5xl"
          >
            كسر المستحيل: Android NDK كامل تحت{" "}
            <span className="text-emerald-400">300 ميغابايت</span>
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-zinc-400">
            تمثيل كل header في <span className="font-mono text-amber-300">Assembly</span> +
            تصغير شجرة الملفات بمحرك <span className="font-mono text-amber-300">Z3</span> +
            ضغط حتمي بـ <span className="font-mono text-amber-300">zstd/xz</span> — مع{" "}
            loader يحاكي سلوك الـ NDK الأصلي.
          </p>

          {/* CTA */}
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button
              asChild
              className="h-12 bg-emerald-500 px-6 text-base font-bold text-zinc-950 hover:bg-emerald-400"
            >
              <a href="#z3">
                جرّب Z3 الآن
                <ArrowDown className="size-4" aria-hidden="true" />
              </a>
            </Button>
            <Button
              asChild
              variant="outline"
              className="h-12 border-zinc-700 bg-zinc-900 px-6 text-base text-zinc-200 hover:bg-zinc-800 hover:text-zinc-50"
            >
              <a href={GH_REPO_URL} target="_blank" rel="noopener noreferrer">
                <Github className="size-4" aria-hidden="true" />
                المستودع على GitHub
              </a>
            </Button>
          </div>
        </motion.div>

        {/* Size comparison bars */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="mt-12 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 sm:p-7"
          aria-label="مقارنة الأحجام"
        >
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-bold text-zinc-200">
              المقارنة: الحجم الأصلي مقابل الحزمة الناتجة
            </h2>
            {isPending ? (
              <Badge
                variant="outline"
                className="border-amber-400/40 bg-amber-400/10 text-amber-400"
              >
                قيد القياس على GitHub Actions
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
              >
                {data?.stages.pack.within_budget === false
                  ? "تجاوز الميزانية — قيد التحسين"
                  : "ضمن ميزانية 300MB"}
              </Badge>
            )}
          </div>

          {/* Original NDK bar */}
          <div>
            <div className="mb-1.5 flex items-baseline justify-between text-sm">
              <span className="text-zinc-300">
                NDK الرسمي {originalMb == null ? "(~2.9GB بعد الفك)" : "(بعد الفك)"}
              </span>
              <span className="font-mono font-semibold text-zinc-400" dir="ltr">
                {originalMb != null ? `${fmtInt(originalMb)} MB` : "~2,900 MB"}
              </span>
            </div>
            <div className="h-8 w-full overflow-hidden rounded-lg bg-zinc-800/80">
              <motion.div
                initial={{ width: 0 }}
                whileInView={{ width: "100%" }}
                viewport={{ once: true }}
                transition={{ duration: 0.9, ease: "easeOut" }}
                className="h-full rounded-lg bg-gradient-to-l from-zinc-600 to-zinc-500"
              />
            </div>
          </div>

          {/* Package bar */}
          <div className="mt-5">
            <div className="mb-1.5 flex items-baseline justify-between text-sm">
              <span className="text-zinc-300">
                حزمة ndk-nano {isPending && "(الهدف الأقصى)"}
              </span>
              <span
                className={`font-mono font-semibold ${isPending ? "text-amber-400" : "text-emerald-400"}`}
                dir="ltr"
              >
                {isPending ? `<= ${BUDGET_MB} MB` : `${fmtInt(packageMb ?? 0)} MB`}
              </span>
            </div>
            <div className="h-8 w-full overflow-hidden rounded-lg bg-zinc-800/80">
              <motion.div
                initial={{ width: 0 }}
                whileInView={{ width: `${packagePct}%` }}
                viewport={{ once: true }}
                transition={{ duration: 0.9, delay: 0.15, ease: "easeOut" }}
                className={`h-full rounded-lg ${
                  isPending
                    ? "bg-gradient-to-l from-amber-400 to-amber-500"
                    : "bg-gradient-to-l from-emerald-400 to-emerald-500"
                }`}
              />
            </div>
            <p className="mt-2 text-xs text-zinc-500">
              {isPending
                ? "الشريط الذهبي يمثل سقف الميزانية (300MB)؛ سيُستبدل بالحجم الفعلي بعد أول تشغيل كامل لخط الإنتاج."
                : `الحزمة الفعلية تشغل ${packagePct.toFixed(1)}% من حجم الـ NDK الأصلي.`}
            </p>
          </div>
        </motion.div>

        {/* KPI row */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4, delay: 0.15 }}
          className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
        >
          <KpiCard
            icon={<Scale className="size-4" aria-hidden="true" />}
            label="الحجم الأصلي"
            value={loading ? null : originalMb}
            suffix="MB"
            pendingText="قيد القياس"
          />
          <KpiCard
            icon={<Package2 className="size-4" aria-hidden="true" />}
            label="الحزمة النهائية"
            value={loading ? null : packageMb}
            suffix="MB"
            pendingText="قيد القياس"
          />
          <KpiCard
            icon={<Percent className="size-4" aria-hidden="true" />}
            label="نسبة الضغط"
            value={loading ? null : ratio}
            suffix="%"
            pendingText="قيد القياس"
          />
          <KpiCard
            icon={<FileX2 className="size-4" aria-hidden="true" />}
            label="ملفات حُذفت"
            value={loading ? null : removedFiles}
            suffix="ملف"
            pendingText="قيد القياس"
          />
        </motion.div>
      </div>
    </section>
  );
}
