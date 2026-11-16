"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { BrainCircuit, FlaskConical, Loader2, Play, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import datasetJson from "@/data/z3-dataset.json";
import { cn } from "@/lib/utils";

interface Z3Option {
  id: string;
  label: string;
  cost_kb: number;
  files: string[];
  symbols: string[];
}

const dataset = datasetJson as {
  description: string;
  options: Z3Option[];
  default_symbols: string[];
};

interface SolveResponse {
  solver: string;
  required: string[];
  z3: { kept: Z3Option[]; total_kb: number; solve_ms: number };
  greedy: { kept_ids: string[]; total_kb: number };
  saved_vs_greedy_kb: number;
  proof_note: string;
}

function fmtInt(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

export function Z3Playground() {
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(dataset.default_symbols)
  );
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<SolveResponse | null>(null);

  const providersBySymbol = useMemo(() => {
    const map = new Map<string, Z3Option[]>();
    for (const opt of dataset.options) {
      for (const sym of opt.symbols) {
        const list = map.get(sym) ?? [];
        list.push(opt);
        map.set(sym, list);
      }
    }
    return map;
  }, []);

  const toggleSymbol = (sym: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(sym);
      else next.delete(sym);
      return next;
    });
  };

  const runSolve = async () => {
    if (selected.size === 0) return;
    setRunning(true);
    try {
      const res = await fetch("/api/z3/solve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbols: Array.from(selected) }),
      });
      const json = await res.json();
      if (!res.ok) {
        if (json?.error === "UNKNOWN_SYMBOL" && Array.isArray(json.unknown)) {
          toast.error("رموز غير معروفة", {
            description: `لم يتم العثور على مزوّد لهذه الرموز: ${json.unknown.join(", ")}`,
          });
        } else {
          toast.error("فشل حل المسألة", {
            description: json?.error ?? `HTTP ${res.status}`,
          });
        }
        return;
      }
      setResult(json as SolveResponse);
      toast.success("وجد Z3 الحل الأمثل", {
        description:
          json.saved_vs_greedy_kb > 0
            ? `توفير ${fmtInt(json.saved_vs_greedy_kb)} KB مقارنة بالـ Greedy`
            : "الحل الأمثل يساوي حل الـ Greedy هنا",
      });
    } catch (err) {
      toast.error("تعذر الاتصال بالخادم", {
        description: err instanceof Error ? err.message : "خطأ غير متوقع",
      });
    } finally {
      setRunning(false);
    }
  };

  const greedyKeptLabels = result
    ? dataset.options
        .filter((o) => result.greedy.kept_ids.includes(o.id))
        .map((o) => o.label)
    : [];

  return (
    <section
      id="z3"
      className="scroll-mt-24 border-b border-zinc-800/80 bg-zinc-900/20"
      aria-labelledby="z3-title"
    >
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4 }}
        >
          <h2 id="z3-title" className="text-2xl font-extrabold text-zinc-50 sm:text-3xl">
            ملعب Z3: أثبت الحد الأدنى بنفسك
          </h2>
          <p className="mt-3 max-w-3xl leading-relaxed text-zinc-400">
            اختر الرموز (symbols) التي يحتاجها مشروعك، وسيحل محرك{" "}
            <span className="font-mono text-amber-300">Z3 SMT</span> مسألة set-cover
            المرجّحة ليُثبت أصغر مجموعة ملفات تغطيها — وقارن النتيجة بخوارزمية Greedy
            الجشعة.
          </p>
          <p className="mt-2 text-xs leading-relaxed text-zinc-500">
            {dataset.description}
          </p>
        </motion.div>

        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Right column (first in RTL): symbol selection */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: 0.05 }}
          >
            <Card className="border-zinc-800 bg-zinc-900/40">
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="text-base text-zinc-100">
                    الرموز المطلوبة
                  </CardTitle>
                  <Badge variant="outline" className="border-zinc-700 bg-zinc-950 text-zinc-300">
                    {selected.size} محدد
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <TooltipProvider delayDuration={150}>
                  <div className="max-h-96 space-y-3 overflow-y-auto slim-scroll pe-1">
                    {dataset.options.map((opt) => {
                      const providedSelected = opt.symbols.filter((s) =>
                        selected.has(s)
                      );
                      const isRelevant = providedSelected.length > 0;
                      return (
                        <div
                          key={opt.id}
                          className={cn(
                            "rounded-lg border p-3 transition-colors",
                            isRelevant
                              ? "border-emerald-500/50 bg-emerald-500/5"
                              : "border-zinc-800 bg-zinc-950/50"
                          )}
                        >
                          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                            <p className="text-sm font-bold text-zinc-200">
                              {opt.label}
                            </p>
                            <div className="flex items-center gap-1.5">
                              {isRelevant && (
                                <Badge
                                  variant="outline"
                                  className="border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                                >
                                  يوفّر {providedSelected.length}
                                </Badge>
                              )}
                              <Badge
                                variant="outline"
                                className="border-zinc-700 bg-zinc-950 font-mono text-zinc-400"
                              >
                                <span dir="ltr">{fmtInt(opt.cost_kb)} KB</span>
                              </Badge>
                            </div>
                          </div>
                          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                            {opt.symbols.map((sym) => {
                              const providers = providersBySymbol.get(sym) ?? [];
                              return (
                                <Tooltip key={sym}>
                                  <TooltipTrigger asChild>
                                    <label
                                      className="flex min-h-[44px] cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors hover:bg-zinc-800/60"
                                      aria-label={`الرمز ${sym}`}
                                    >
                                      <Checkbox
                                        checked={selected.has(sym)}
                                        onCheckedChange={(c) =>
                                          toggleSymbol(sym, c === true)
                                        }
                                        className="data-[state=checked]:border-emerald-500 data-[state=checked]:bg-emerald-500 data-[state=checked]:text-zinc-950"
                                      />
                                      <span
                                        className="truncate font-mono text-xs text-zinc-300"
                                        dir="ltr"
                                      >
                                        {sym}
                                      </span>
                                    </label>
                                  </TooltipTrigger>
                                  <TooltipContent
                                    side="top"
                                    className="border-zinc-700 bg-zinc-900 text-zinc-200"
                                  >
                                    <p className="text-xs">
                                      توفره:{" "}
                                      <span className="text-emerald-400">
                                        {providers.map((p) => p.id).join(" + ") || "—"}
                                      </span>
                                    </p>
                                  </TooltipContent>
                                </Tooltip>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </TooltipProvider>

                <Button
                  onClick={runSolve}
                  disabled={running || selected.size === 0}
                  className="mt-4 h-12 w-full bg-emerald-500 text-base font-bold text-zinc-950 hover:bg-emerald-400 disabled:opacity-50"
                >
                  {running ? (
                    <>
                      <Loader2 className="size-5 animate-spin" aria-hidden="true" />
                      Z3 يعمل…
                    </>
                  ) : (
                    <>
                      <Play className="size-5" aria-hidden="true" />
                      شغّل Z3
                    </>
                  )}
                </Button>
                {selected.size === 0 && (
                  <p className="mt-2 text-center text-xs text-amber-400">
                    اختر رمزاً واحداً على الأقل لتشغيل الحل
                  </p>
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* Left column: results */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: 0.1 }}
          >
            <Card className="border-zinc-800 bg-zinc-900/40">
              <CardHeader className="pb-3">
                <CardTitle className="text-base text-zinc-100">
                  نتيجة الحل الأمثل
                </CardTitle>
              </CardHeader>
              <CardContent>
                {running ? (
                  <div className="space-y-3" aria-label="جارٍ الحل">
                    <Skeleton className="h-12 w-full bg-zinc-800" />
                    <Skeleton className="h-24 w-full bg-zinc-800" />
                    <Skeleton className="h-24 w-full bg-zinc-800" />
                    <p className="text-center text-xs text-zinc-500">
                      Z3 يُثبت الحد الأدنى الرياضي… قد يستغرق لحظات
                    </p>
                  </div>
                ) : !result ? (
                  <div className="flex min-h-[280px] flex-col items-center justify-center rounded-xl border border-dashed border-zinc-800 bg-zinc-950/50 p-6 text-center">
                    <BrainCircuit
                      className="size-10 text-zinc-600"
                      aria-hidden="true"
                    />
                    <p className="mt-4 max-w-xs text-sm leading-relaxed text-zinc-400">
                      اختر الرموز المطلوبة من القائمة ثم اضغط «شغّل Z3» لرؤية أصغر
                      مجموعة ملفات ممكنة — مُثبتة رياضياً.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Totals */}
                    <div className="grid grid-cols-3 gap-3">
                      <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-center">
                        <p className="text-[11px] text-emerald-300/80">إجمالي Z3</p>
                        <p className="font-mono text-xl font-extrabold text-emerald-400" dir="ltr">
                          {fmtInt(result.z3.total_kb)}
                          <span className="text-xs"> KB</span>
                        </p>
                      </div>
                      <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-3 text-center">
                        <p className="text-[11px] text-zinc-500">إجمالي Greedy</p>
                        <p className="font-mono text-xl font-extrabold text-zinc-300" dir="ltr">
                          {fmtInt(result.greedy.total_kb)}
                          <span className="text-xs"> KB</span>
                        </p>
                      </div>
                      <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-3 text-center">
                        <p className="text-[11px] text-zinc-500">الفارق</p>
                        <p className="font-mono text-xl font-extrabold text-zinc-300" dir="ltr">
                          {fmtInt(result.greedy.total_kb - result.z3.total_kb)}
                          <span className="text-xs"> KB</span>
                        </p>
                      </div>
                    </div>

                    {result.saved_vs_greedy_kb > 0 && (
                      <Badge
                        variant="outline"
                        className="w-full justify-center border-emerald-500/40 bg-emerald-500/10 py-2.5 text-sm text-emerald-400"
                      >
                        <ShieldCheck className="size-4" aria-hidden="true" />
                        Z3 وفّر {fmtInt(result.saved_vs_greedy_kb)} KB
                      </Badge>
                    )}

                    {/* Kept table */}
                    <div className="overflow-x-auto slim-scroll rounded-xl border border-zinc-800">
                      <Table>
                        <TableHeader>
                          <TableRow className="border-zinc-800 bg-zinc-950/70 hover:bg-zinc-950/70">
                            <TableHead className="text-zinc-400">
                              الملفات التي أبقاها Z3
                            </TableHead>
                            <TableHead className="text-zinc-400">عدد الملفات</TableHead>
                            <TableHead className="text-left text-zinc-400">الحجم</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {result.z3.kept.map((opt) => (
                            <TableRow key={opt.id} className="border-zinc-800">
                              <TableCell className="py-3 text-sm text-zinc-200">
                                {opt.label}
                              </TableCell>
                              <TableCell className="font-mono text-sm text-zinc-300" dir="ltr">
                                {opt.files.length}
                              </TableCell>
                              <TableCell className="text-left font-mono text-sm font-bold text-emerald-400" dir="ltr">
                                {fmtInt(opt.cost_kb)} KB
                              </TableCell>
                            </TableRow>
                          ))}
                          <TableRow className="border-zinc-800 bg-zinc-950/70">
                            <TableCell className="py-3 text-sm font-bold text-zinc-100">
                              الإجمالي
                            </TableCell>
                            <TableCell className="font-mono text-sm text-zinc-300" dir="ltr">
                              {result.z3.kept.reduce((a, o) => a + o.files.length, 0)}
                            </TableCell>
                            <TableCell className="text-left font-mono text-sm font-extrabold text-emerald-400" dir="ltr">
                              {fmtInt(result.z3.total_kb)} KB
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>

                    {/* Greedy comparison */}
                    <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
                      <p className="text-xs text-zinc-500">
                        اختيارات Greedy الجشعة (أكبر تغطية لكل كيلوبايت):
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {greedyKeptLabels.map((label) => (
                          <Badge
                            key={label}
                            variant="outline"
                            className="border-zinc-700 bg-zinc-900 text-xs font-normal text-zinc-400"
                          >
                            {label}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    {/* Meta */}
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="border-zinc-700 bg-zinc-950 text-zinc-300">
                        <FlaskConical className="size-3" aria-hidden="true" />
                        المحرّك: <span dir="ltr">{result.solver}</span>
                      </Badge>
                      <Badge variant="outline" className="border-zinc-700 bg-zinc-950 text-zinc-300">
                        <span dir="ltr">زمن الحل: {fmtInt(result.z3.solve_ms)} ms</span>
                      </Badge>
                    </div>

                    <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs leading-relaxed text-emerald-300/90">
                      {result.proof_note}
                    </p>

                    {result.solver !== "z3" && (
                      <p className="rounded-lg border border-amber-400/40 bg-amber-400/10 p-3 text-xs leading-relaxed text-amber-300">
                        ملاحظة: تعذّر تشغيل Z3 في هذه الجلسة، فحُلّت المسألة بخوارزمية
                        Branch &amp; Bound دقيقة (bnb-fallback) تعطي الحد الأدنى نفسه.
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
