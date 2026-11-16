"use client";

import { motion } from "framer-motion";
import { CheckCircle2, FlaskConical, Scale } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export function HonestySection() {
  return (
    <section
      id="honesty"
      className="scroll-mt-24 border-b border-zinc-800/80"
      aria-labelledby="honesty-title"
    >
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4 }}
        >
          <Alert className="border-amber-400/40 bg-amber-400/5 ltr:text-left">
            <Scale className="size-5 text-amber-400" aria-hidden="true" />
            <AlertTitle id="honesty-title" className="text-lg font-bold text-amber-300">
              الأمانة العلمية
            </AlertTitle>
            <AlertDescription className="space-y-4 text-sm leading-relaxed text-zinc-300">
              <div>
                <p className="mb-1.5 flex items-center gap-2 font-bold text-emerald-400">
                  <CheckCircle2 className="size-4" aria-hidden="true" />
                  ما هو مُثبَت
                </p>
                <p>
                  التقليم و strip والضغط عمليات قابلة للقياس والمقارنة بت-ببت، وحل
                  مسألة set-cover بـ Z3 Optimize يقدّم برهاناً رياضياً على أن قائمة
                  الإبقاء هي الحد الأدنى المطلق لحجم الشجرة، وقواعد peephole على
                  الـ Assembly تُثبت فردياً بتكافؤ bitvector في Z3 قبل تطبيقها،
                  والتحقق النهائي يبني مشاريع JNI فعلية ويقارن المخرجات ثنائياً في
                  GitHub Actions.
                </p>
              </div>
              <div>
                <p className="mb-1.5 flex items-center gap-2 font-bold text-amber-400">
                  <FlaskConical className="size-4" aria-hidden="true" />
                  ما هو عرض توضيحي (ديمو)
                </p>
                <p>
                  عينات الـ Assembly في هذه الصفحة معاينات صغيرة الحجم: الآلية
                  (peephole المُثبت بـ Z3) حقيقية ومُتحقق منها، لكنها معروضة هنا على
                  مقياس مصغّر — تطبيقها على كامل الـ sysroot يجري ضمن خط الإنتاج في
                  المستودع. كذلك هدف «أقل من 300MB» هو قيد يُفرض حالياً بحارس حجم
                  في الـ CI (budget guard) وليس رقماً مُقاساً بعد؛ الأرقام النهائية
                  ستظهر تلقائياً في هذه الصفحة بعد أول تشغيل كامل.
                </p>
              </div>
            </AlertDescription>
          </Alert>
        </motion.div>
      </div>
    </section>
  );
}
