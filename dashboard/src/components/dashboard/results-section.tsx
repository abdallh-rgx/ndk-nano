"use client";

import { motion } from "framer-motion";
import {
  CheckCircle2,
  Clock,
  ExternalLink,
  Github,
  Loader2,
  Star,
  Tag,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useGhStatus } from "@/hooks/use-gh-status";
import { usePipeline } from "@/hooks/use-pipeline";

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.toISOString().slice(0, 10)} ${d.toISOString().slice(11, 16)} UTC`;
}

function RunStatusChip({
  status,
  conclusion,
}: {
  status: string;
  conclusion: string | null;
}) {
  if (status === "completed") {
    if (conclusion === "success") {
      return (
        <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-400">
          <CheckCircle2 className="size-3" aria-hidden="true" />
          نجاح
        </Badge>
      );
    }
    if (conclusion === "cancelled") {
      return (
        <Badge variant="outline" className="border-zinc-600 bg-zinc-800 text-zinc-300">
          ملغى
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="border-rose-500/40 bg-rose-500/10 text-rose-400">
        <XCircle className="size-3" aria-hidden="true" />
        فشل
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-amber-400/40 bg-amber-400/10 text-amber-400">
      <Loader2 className="size-3 animate-spin" aria-hidden="true" />
      {status === "queued" ? "في الطابور" : "قيد التشغيل"}
    </Badge>
  );
}

function ProjectStatusBadge({ status }: { status: string }) {
  const s = status.toLowerCase();
  if (s === "success" || s === "passed" || s === "ok") {
    return (
      <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-400">
        نجاح
      </Badge>
    );
  }
  if (s === "running" || s === "pending" || s === "queued") {
    return (
      <Badge variant="outline" className="border-amber-400/40 bg-amber-400/10 text-amber-400">
        قيد التشغيل
      </Badge>
    );
  }
  if (s === "failed" || s === "error") {
    return (
      <Badge variant="outline" className="border-rose-500/40 bg-rose-500/10 text-rose-400">
        فشل
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-zinc-700 bg-zinc-900 text-zinc-300">
      {status}
    </Badge>
  );
}

function GitHubLiveCard() {
  // Poll on mount and refetch every 120 seconds.
  const { data, loading } = useGhStatus(120_000);

  const run = data?.latest_run ?? null;
  const release = data?.latest_release ?? null;
  const repo = data?.repo ?? null;

  return (
    <Card className="h-full border-zinc-800 bg-zinc-900/40">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base text-zinc-100">
            <Github className="size-4" aria-hidden="true" />
            الحالة الحية من GitHub
          </CardTitle>
          {repo && (
            <Badge variant="outline" className="border-zinc-700 bg-zinc-950 text-zinc-300">
              <Star className="size-3 text-amber-400" aria-hidden="true" />
              <span dir="ltr">{repo.stars.toLocaleString("en-US")}</span>
              <span className="text-zinc-500">نجمة</span>
            </Badge>
          )}
        </div>
        <CardDescription className="text-zinc-500">
          تُحدَّث تلقائياً كل دقيقتين — بدون أي رموز مصادقة (مستودع عام).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading && !data ? (
          <p className="py-8 text-center text-sm text-zinc-500">
            جارٍ جلب حالة المستودع…
          </p>
        ) : (
          <>
            {/* Latest run */}
            <a
              href={run?.html_url ?? "https://github.com/abdallh-rgx/ndk-nano/actions"}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-[44px] items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 transition-colors hover:border-zinc-700"
              aria-label="آخر تشغيل لخط الإنتاج"
            >
              <div className="min-w-0">
                <p className="text-xs text-zinc-500">آخر تشغيل لـ pipeline.yml</p>
                <p className="truncate font-mono text-xs text-zinc-400" dir="ltr">
                  {run ? run.head_sha.slice(0, 7) : "—"}
                  {run && ` — ${fmtDate(run.created_at)}`}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {run ? (
                  <RunStatusChip status={run.status} conclusion={run.conclusion} />
                ) : (
                  <Badge variant="outline" className="border-zinc-700 bg-zinc-900 text-zinc-400">
                    لا يوجد تشغيل بعد
                  </Badge>
                )}
                <ExternalLink className="size-3.5 text-zinc-500" aria-hidden="true" />
              </div>
            </a>

            {/* Latest release */}
            <div className="flex min-h-[44px] items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
              <div className="min-w-0">
                <p className="text-xs text-zinc-500">أحدث إصدار</p>
                {release ? (
                  <p className="truncate text-sm text-zinc-300">
                    <span className="font-mono" dir="ltr">
                      {release.tag}
                    </span>
                    {release.asset_name && (
                      <span className="text-zinc-500"> — {release.asset_name}</span>
                    )}
                  </p>
                ) : (
                  <p className="text-sm text-zinc-500">لا يوجد إصدار بعد</p>
                )}
              </div>
              {release ? (
                <div className="flex shrink-0 items-center gap-2">
                  {release.asset_mb != null && (
                    <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-400">
                      <span dir="ltr">
                        {release.asset_mb.toLocaleString("en-US", {
                          maximumFractionDigits: 1,
                        })}{" "}
                        MB
                      </span>
                    </Badge>
                  )}
                  <a
                    href={release.html_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex size-9 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
                    aria-label="فتح صفحة الإصدار"
                  >
                    <ExternalLink className="size-3.5" aria-hidden="true" />
                  </a>
                </div>
              ) : (
                <Tag className="size-4 text-zinc-600" aria-hidden="true" />
              )}
            </div>

            {data?.error && (
              <p className="text-xs text-amber-400">
                تعذر الوصول إلى GitHub API — ستُعاد المحاولة تلقائياً.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function ResultsSection() {
  const { data } = usePipeline();
  const projects = data?.stages.verify.projects ?? [];
  const mode = data?.stages.verify.mode ?? null;

  return (
    <section
      id="results"
      className="scroll-mt-24 border-b border-zinc-800/80"
      aria-labelledby="results-title"
    >
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4 }}
        >
          <h2 id="results-title" className="text-2xl font-extrabold text-zinc-50 sm:text-3xl">
            النتائج والتحقق
          </h2>
          <p className="mt-3 max-w-3xl leading-relaxed text-zinc-400">
            التحقق الحقيقي هو أن مشاريع JNI فعلية تُبنى بحزمة ndk-nano وتُنتج نفس
            المخرجات الثنائية للـ NDK الكامل.
          </p>
        </motion.div>

        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-5">
          {/* Projects table */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: 0.05 }}
            className="lg:col-span-3"
          >
            <Card className="h-full border-zinc-800 bg-zinc-900/40">
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="text-base text-zinc-100">
                    مشاريع التحقق ({projects.length})
                  </CardTitle>
                  {mode && (
                    <Badge variant="outline" className="border-zinc-700 bg-zinc-950 text-zinc-300">
                      <span dir="ltr">mode: {mode}</span>
                    </Badge>
                  )}
                </div>
                <CardDescription className="text-zinc-500">
                  يُبنى كل مشروع مرتين: بشجرة كاملة وشجرة مخصصة له، وتُقارن المخرجات.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {projects.length === 0 ? (
                  <div className="flex min-h-[220px] flex-col items-center justify-center rounded-xl border border-dashed border-zinc-800 bg-zinc-950/50 p-6 text-center">
                    <Clock className="size-9 text-zinc-600" aria-hidden="true" />
                    <p className="mt-4 max-w-sm text-sm leading-relaxed text-zinc-400">
                      سيتحدث الجدول تلقائياً بعد أول تشغيل لـ GitHub Actions
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto slim-scroll rounded-xl border border-zinc-800">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-zinc-800 bg-zinc-950/70 hover:bg-zinc-950/70">
                          <TableHead className="text-zinc-400">المشروع</TableHead>
                          <TableHead className="text-zinc-400">الشجرة</TableHead>
                          <TableHead className="text-zinc-400">الحالة</TableHead>
                          <TableHead className="text-zinc-400">المخرج</TableHead>
                          <TableHead className="text-zinc-400">الآلة</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {projects.map((p) => (
                          <TableRow key={`${p.name}-${p.tree}`} className="border-zinc-800">
                            <TableCell className="py-3">
                              <span className="font-mono text-sm text-zinc-200" dir="ltr">
                                {p.name}
                              </span>
                            </TableCell>
                            <TableCell className="text-sm text-zinc-300">
                              {p.tree === "full" ? "كامل" : "مخصص"}
                            </TableCell>
                            <TableCell>
                              <ProjectStatusBadge status={p.status} />
                            </TableCell>
                            <TableCell>
                              <span className="font-mono text-xs text-zinc-400" dir="ltr">
                                {p.artifact}
                              </span>
                            </TableCell>
                            <TableCell>
                              <span className="font-mono text-xs text-zinc-400" dir="ltr">
                                {p.machine}
                              </span>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* GitHub live */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="lg:col-span-2"
          >
            <GitHubLiveCard />
          </motion.div>
        </div>
      </div>
    </section>
  );
}
