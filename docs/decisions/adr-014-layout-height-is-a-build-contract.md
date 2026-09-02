---
title: ارتفاعِ layout یک قراردادِ build است، نه یک سلیقهٔ CSS
status: accepted
updated: 2026-09-02
sources: [src/index.css, scripts/check-css.mjs, src/lib/__tests__/interactive.test.tsx, src/components/CanvasArea.tsx, src/lib/__tests__/drawing.test.tsx]
---

# ADR-014 — چرا `html { height: 100% }` باید ruleِ خودش باشد

## Context

خواننده دو بار گفت پنل‌ها اسکرول نمی‌شوند. هر دو بار کلاس‌ها درست بودند: `flex-1 min-h-0 overflow-y-auto`
روی scroller، `flex flex-col h-full min-h-0 overflow-hidden` روی `<aside>`، و `html, body, #root` هم
`height: 100%` داشت. **در سورس.**

در CSSِ ساخته‌شده اینطور نبود. باندلر آن rule را این‌طور بیرون داد:

```
,body,#root{background:…;height:100%;…}
```

سلکتورِ `html` حذف شده و کامایش جا مانده. یک selector list که با کاما شروع شود **نامعتبر** است، و بازیابیِ
خطای CSS **کلِ rule** را دور می‌ریزد — پس `body` و `#root` هم بی‌صدا ارتفاعشان را از دست دادند. شمارشِ
`html{…height:100%…}` در `dist/assets/*.css` **صفر** بود.

## Decision

- `html` در `src/index.css` **ruleِ مستقلِ خودش** را دارد. هیچ ruleِ دیگری با آن شریک نمی‌شود.
- `scripts/check-css.mjs` این را در دو جا می‌سنجد: سورس (ارزان، بدون build) و **خروجیِ build** (دندان‌دار،
  چون باگ در سورس نامرئی بود). هر selector list با کامای ابتدایی → exit 1.
- تستِ `interactive.test.tsx` زنجیرهٔ ارتفاع را از **خودِ stylesheet** می‌خواند، نه از توصیفِ آن.

## Why

بدون ارتفاعِ کران‌دار، هیچ ظرفِ `overflow-y: auto` ای **هرگز** اسکرول نمی‌کند — محتوایش فقط بیرون می‌زند.
به همین دلیل افزودن `min-h-0` به scrollerها هیچ اثری نداشت: ارتفاعِ گم‌شده سه لایه بالاتر بود.

این یک باگِ CSS نبود؛ یک باگِ **build** بود که لباسِ CSS پوشیده بود. هیچ gate ای آن را نمی‌دید، چون همهٔ
gateها سورس را می‌خواندند و سورس درست بود.

## Consequences

- `check-css` بدون `dist/` فقط نیمهٔ سورس را می‌سنجد و خودش این را چاپ می‌کند — بی‌صدا نصفه اجرا نمی‌شود.
- قاعدهٔ کلی: هر contract ای که **باندلر** می‌تواند بشکندش، باید روی **خروجیِ build** سنجیده شود.
- محدودیتِ صادقانه: jsdom هیچ layout ای محاسبه نمی‌کند، پس `scrollHeight > clientHeight` در این سندباکس
  قابلِ سنجش نیست (و مرورگری هم نصب نمی‌شود — دانلودِ playwright مسدود است). CSS سنجیده شد، هندسه نه.
