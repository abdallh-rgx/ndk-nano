"use client";

import { motion } from "framer-motion";
import { ArrowDown, ArrowLeft, Binary, TerminalSquare } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

function DiagramArrow() {
  return (
    <span className="flex shrink-0 items-center justify-center text-zinc-600" aria-hidden="true">
      <ArrowDown className="size-4 md:hidden" />
      <ArrowLeft className="hidden size-4 md:inline" />
    </span>
  );
}

function ArtifactNode({
  title,
  subtitle,
  final = false,
}: {
  title: string;
  subtitle: string;
  final?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex w-full min-w-[9.5rem] shrink-0 flex-col items-center justify-center rounded-xl border p-3 text-center md:w-auto",
        final
          ? "border-emerald-500/60 bg-emerald-500/15"
          : "border-zinc-700 bg-zinc-900/80"
      )}
    >
      <p className={cn("text-sm font-bold", final ? "text-emerald-300" : "text-zinc-100")}>
        {title}
      </p>
      <p className="mt-0.5 font-mono text-[11px] text-zinc-500" dir="ltr">
        {subtitle}
      </p>
    </div>
  );
}

function ProcessNode({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="flex w-full min-w-[9.5rem] shrink-0 flex-col items-center justify-center rounded-xl border border-emerald-500/40 bg-emerald-500/5 p-3 text-center md:w-auto">
      <p className="text-sm font-bold text-emerald-300">{title}</p>
      <p className="mt-0.5 font-mono text-[11px] text-emerald-500/70" dir="ltr">
        {subtitle}
      </p>
    </div>
  );
}

const USAGE_LINES = [
  "# تثبيت واستخدام",
  "./loader/ndk-nano setup",
  "./loader/ndk-nano clang --target=aarch64-linux-android24 -c main.c",
  "cmake -G Ninja ... $(./loader/ndk-nano cmake-args) ..",
  "./loader/ndk-nano ndk-build",
];

function UsageBlock() {
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950" dir="ltr">
      <div className="flex items-center gap-2 border-b border-zinc-800 px-4 py-2.5">
        <TerminalSquare className="size-4 text-zinc-500" aria-hidden="true" />
        <span className="font-mono text-xs text-zinc-500">loader — quickstart</span>
      </div>
      <pre className="slim-scroll overflow-x-auto p-4 text-left font-mono text-xs leading-7">
        <code>
          {USAGE_LINES.map((line, i) => {
            if (line.startsWith("#")) {
              return (
                <div key={i} className="text-zinc-500">
                  {line}
                </div>
              );
            }
            const [head, ...rest] = line.split(" ");
            return (
              <div key={i}>
                <span className="font-semibold text-emerald-400">{head}</span>
                {rest.length > 0 && (
                  <span className="text-zinc-300"> {rest.join(" ")}</span>
                )}
              </div>
            );
          })}
        </code>
      </pre>
    </div>
  );
}

export function ArchSection() {
  return (
    <section
      id="arch"
      className="scroll-mt-24 border-b border-zinc-800/80 bg-zinc-900/20"
      aria-labelledby="arch-title"
    >
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4 }}
        >
          <h2 id="arch-title" className="text-2xl font-extrabold text-zinc-50 sm:text-3xl">
            البنية: من 2.9GB إلى أقل من 300MB
          </h2>
          <p className="mt-3 max-w-3xl leading-relaxed text-zinc-400">
            مسار واحد حتمي يمر عبر التقليم، التمثيل في Assembly، الحل الأمثل بـ Z3،
            والضغط الحتمي — وينتهي بـ loader يقدّم نفس واجهات الـ NDK للأدوات
            المستهدفة.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4, delay: 0.05 }}
          className="mt-8"
        >
          <Card className="border-zinc-800 bg-zinc-900/40">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-base text-zinc-100">
                <Binary className="size-4 text-emerald-400" aria-hidden="true" />
                مخطط خط الإنتاج
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="slim-scroll flex flex-col items-stretch gap-2 md:flex-row md:items-center md:overflow-x-auto md:pb-2">
                <ArtifactNode title="NDK الرسمي" subtitle="~2.9 GB" />
                <DiagramArrow />
                <ProcessNode title="تقليم + strip" subtitle="prune + hardlink-strip" />
                <DiagramArrow />
                <ArtifactNode title="شجرة arm64" subtitle="arm64-v8a only" />
                <DiagramArrow />
                <ProcessNode title="تمثيل الـ headers" subtitle="manifest: headers -> asm" />
                <DiagramArrow />
                <ProcessNode title="الحد الأدنى بـ Z3" subtitle="set-cover + peephole" />
                <DiagramArrow />
                <ArtifactNode title="قائمة الإبقاء" subtitle="keep-list" />
                <DiagramArrow />
                <ProcessNode title="ضغط حتمي" subtitle="zstd -19 / xz -9e" />
                <DiagramArrow />
                <ArtifactNode title="الحزمة النهائية" subtitle="< 300 MB" final />
                <DiagramArrow />
                <ProcessNode title="loader: محاكي NDK" subtitle="clang / cmake / ndk-build" />
              </div>
              <div className="mt-4 flex flex-wrap gap-2" aria-hidden="true">
                <Badge variant="outline" className="border-zinc-700 bg-zinc-950 text-zinc-400">
                  صناديق zinc: بيانات ونتاجات
                </Badge>
                <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-400">
                  صناديق emerald: مراحل معالجة
                </Badge>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2"
        >
          <div>
            <h3 className="mb-3 text-base font-bold text-zinc-100">الاستخدام</h3>
            <UsageBlock />
            <p className="mt-3 text-xs leading-relaxed text-zinc-500">
              الـ loader يقدّم أوامر تحاكي الـ NDK الأصلي: يمرر المسارات والأعلام
              الصحيحة إلى clang و cmake و ndk-build بعد فك ضغط الحزمة المخصصة لمشروعك.
            </p>
          </div>
          <div>
            <h3 className="mb-3 text-base font-bold text-zinc-100">
              لماذا هذا ممكن أصلاً؟
            </h3>
            <div className="space-y-3 text-sm leading-relaxed text-zinc-400">
              <p>
                الـ NDK يتضمن <span dir="ltr">4</span> ABIs وأدوات host متعددة
                وtoolchains قديمة ووثائق — مشروع واحد يستهدف{" "}
                <span className="font-mono text-xs text-amber-300" dir="ltr">
                  arm64-v8a
                </span>{" "}
                لا يحتاج إلا كسراً صغيراً منها.
              </p>
              <p>
                معظم حجم ما يتبقى يذهب إلى ثنائيات ضخمة غير مقلمة وملفات لا يمسها
                الرابط؛ مسألة «أي الملفات نُبقي» هي مسألة set-cover كلاسيكية — وZ3
                يحلها بالحد الأدنى المُثبت بدل التخمين الجشع.
              </p>
              <p>
                الضغط الحتمي بـ <span className="font-mono text-xs text-amber-300">zstd</span>{" "}
                و <span className="font-mono text-xs text-amber-300">xz</span> على
                شجرة صغيرة أصلاً يضاعف المكسب، مع تثبيت بصمة الأرشيف في الـ CI
                لإنتاج حزم قابلة لإعادة الإنتاج.
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
