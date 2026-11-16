# لوحة تحكم ndk-nano / ndk-nano Dashboard

لوحة ويب عربية (RTL) لتقديم المشروع ونتائجه — Next.js 16 + TypeScript + Tailwind 4 + shadcn/ui.

## المزايا
- عرض حي لنتائج خط الإنتاج من `data/pipeline-state.json` (نسخة محدثة تلقائياً).
- **ملعب Z3 تفاعلي**: اختر الرموز المطلوبة و`POST /api/z3/solve` يحل مسألة set-cover بمحرك Z3 الحقيقي (حزمة `z3-solver` npm) ويقارن النتيجة بخوارزمية Greedy.
- عارض تمثيل الـ Headers في Assembly (مخرجات clang -Oz -S حقيقية من الـ manifest).
- حالة GitHub Actions والإصدارات عبر `/api/gh/status` (مع لقطة مخبأة `src/data/gh-status.json` عند حجب API غير الموثق).

## التشغيل
```bash
bun install
bun run dev   # http://localhost:3000
```

## البنية
- `src/app/page.tsx` — الصفحة الوحيدة (لوحة كاملة).
- `src/app/api/pipeline` — يقرأ `src/data/pipeline-state.json`.
- `src/app/api/z3/solve` — حل Z3 Optimize حقيقي (set-cover مرجّح) + مقارنة Greedy.
- `src/app/api/gh/status` — حالة المستودع والتشغيلات والإصدار.
- `src/data/` — حالة الخط + بيانات الملعب + لقطة GitHub.
