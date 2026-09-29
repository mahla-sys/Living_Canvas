---
title: کارنامهٔ گفتگوی ۲۰۲۶-۰۹-۲۵ — پلن قدم‌به‌قدم
status: active
updated: 2026-09-25
sources: [docs/inbox.md, docs/ui-spec.md, src/state.ts, src/lib/engine.ts, src/components/CanvasArea.tsx]
related: [docs/inbox.md, docs/ui-spec.md, docs/decisions/adr-035-obsidian-excalidraw-minimal-workspace.md, docs/decisions/adr-036-obsidian-visual-refinement.md]
---

# کارنامه و پلن (Partner Session 2026-09-25)

این سند حرف‌های شریک انسانی را به تصمیم قابل اجرا تبدیل می‌کند. قانون بازی همان است که در `AGENTS.md`
ثبت شده: هر ردیف قبل از ساختن، یا ADR می‌گیرد یا به `inbox.md` می‌رود؛ بعد وارد این چک‌لیست می‌شود.

## وضعیت فعلی گیت‌ها (اندازه‌گیری‌شده روی همین محیط)

| گیت | نتیجه | یادداشت |
|---|---|---|
| typecheck / build | ✅ | سالم |
| check-english / docs / palette / css / facts | ✅ | پنج‌تا پنج |
| vitest (unit/jsdom) | ❌ | ناسازگاری Node v20 با jsdom 30 → `markAsUncloneable` (باید jsdom pin شود) |
| viewport-playwright | ❌ | باینری chromium نصب نیست (`npx playwright install chromium`) |

## فاز A — اول خودِ اپ کمک من باشد (API و پایپ‌لاین تیمی) 🔴 بالاترین اولویت کاربر

- [ ] **A1** تست زندهٔ provider از داخل اپ (Gemini/Mistral/DeepSeek): اگر CORS یا key خطا داد،
      پیام دقیق روی Status bar نه فقط toast. (ربط: inbox #9)
- [ ] **A2** رفع duplicate: `loadProjectFinderPipeline` باید template را *بارگذاری* کند نه بازگویی. (inbox #10)
- [ ] **A3** ساخت «تیم چندمرحله‌ای» به‌عنوان اولین پایپ‌لاین واقعی قابل استفاده: analyze → critique → synthesize
      با قرارداد خروجی معتبر (ADR-003). معیار قبول: یک اجرای واقعی end-to-end با کلید کاربر.
- [ ] **A4** ثبت نتیجه در ADR جدید: کدام providerها live-verified هستند.

## فاز B — ظاهر: Obsidian + Excalidraw

- [ ] **B1** حذف حالت پیش‌فرض breathe از نودهای agent: در `src/state.ts` خط ۶۳۶
      `animation: {type: "none"}` برای همهٔ انواع. (حرکت‌ها فقط وقتی running/waiting باشند.)
- [ ] **B2** حذف حاشیه‌های دور نودها (borderهای روشن): `shapeStyle` در `CanvasArea.tsx` مرز را با
      opacity `4d` می‌کشد؛ هدف = ظاهر تخت Obsidian/Excalidraw بدون قاب. تست `layout-render` بازبینی شود.
- [ ] **B3** پنجره‌های شناور (toolbar، convert، panels) هم border کم‌رنگ‌تر — مطابق adr-036.
- [ ] **B4** Playwright walkthrough به‌عنوان تعریف «done» ظاهری: اسکرینشات قبل/بعد در `artifacts/`.

## فاز C — شکلک‌کشیدن (draw → shape)

یافتهٔ کد: `convertStrokesToGraph` در `engine.ts:2475` خوشه‌ها را پیدا می‌کند ولی فقط نود متنی با عنوان
`Sketch N` می‌سازد — هندسهٔ نقاشی دور ریخته می‌شود. این همان چیزی است که کاربر حس می‌کند «شکل نمی‌کشد».

- [ ] **C1** تبدیل هوشمند: برای هر خوشه، نوع شکل حدس زده شود (دایره/لوزی/مستطیل بر اساس نسبت bbox و
      انحنای مسیر) و `data.shape` روی همان مقادیر موجود (`circle|diamond|hexagon|rectangle`) ست شود.
- [ ] **C2** مسیرهای بسته → یک نود با اندازهٔ bbox خوشه (نه ۲۶۴px ثابت).
- [ ] **C3** تست `drawing.test.tsx` + یک تست جدید roundtrip برای convert-with-shape.

## فاز D — آراستن درخت پروژه (front جدا، backend جدا)

ساختار مطلوب (درخت معکوس؛ برگ‌ها = توابع عملیاتی، شاخه‌ها = مدیران):

```
src/
  ui/          ← اجزای نمایش (components فعلی + styles)
  state/       ← store، schema، portable (منبع حقیقت سمت کلاینت)
  runtime/     ← engine: orchestrator، agents، providers، pipeline
  storage/     ← لایهٔ فایل (fs-access، storage adapter)
tests/         ← آینهٔ شاخه‌های src، نه آینهٔ تک‌تک توابع
```

- [ ] **D1** مووینگ‌های مکانیکی با import-update خودکار؛ هیچ رفتاری عوض نشود؛ گیت‌ها سبز بمانند.
- [ ] **D2** تست‌ها از `src/lib/__tests__` به `tests/<branch>/` منتقل شوند؛ ۳۱ فایل فعلاً درست کار می‌کنند،
      فقط جای اشتباه (زیر شاخهٔ production).

## فاز E — بهداشت

- [ ] **E1** pin کردن jsdom به نسخهٔ سازگار با Node 20 (یا الزام Node ≥22 در README و package engines).
- [ ] **E2** `.gitignore`: افزودن `test-results/` و `artifacts/`.
- [ ] **E3** فعال‌سازی CI (needs a commit with workflows permission — تصمیم با کاربر).
- [ ] **E4** README: حذف ادعای «no jsdom»، همسان‌سازی اعداد تست/بیلد.

## دربارهٔ ۳۱۹ تست: حذف نکنیم، جابه‌جا کنیم

- شمارش واقعی: ۳۱۲ بلوک `it(` در ۳۱ فایل. این تعداد برای سوئییتی که گیت‌های معماری را نگه داشته زیاد نیست؛
  مشکل **حجم تست نیست، چیدمان تست است** (فاز D2) و **اجرا نشدنشان روی Node این محیط** (فاز E1).
- با این حال دو کاندید حذف/ادغام شناسایی شد و طبق Manifesto (سادگی از حذف) بررسی می‌شوند:
  - `tests/a11y.spec.ts` — assertion آن هرگز fail نمی‌شود (`toBeDefined`). یا gate واقعی می‌شود یا حذف (inbox #8).
  - `viewport-playwright.test.ts` vs `tests/a11y.spec.ts` — هم‌پوشانی viewport; یکی بماند.
- قاعدهٔ جدید پیشنهادی برای `docs/patterns`: هر تست باید یکی از سه نقش را داشته باشد — گیت رفتار، گیت معماری،
  یا گیت رگرشن ظاهری. تستی که هیچ‌کدام نیست، حذف می‌شود.
