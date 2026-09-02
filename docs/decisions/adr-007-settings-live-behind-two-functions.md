---
title: تنظیماتِ محلی پشت دو تابع، نه پشت یک قاعده‌ی گفتاری
status: accepted
updated: 2026-09-02
sources: [src/lib/core.ts#readSettingsLocal, src/state.ts#defaultSettings, src/main.tsx, docs/ARCHITECTURE.md#1]
---

# ADR-007 — `lc-settings` فقط از راه `readSettingsLocal` / `writeSettingsLocal` خوانده و نوشته می‌شود

## Context

قانون ۴ (`docs/ARCHITECTURE.md#1`) سومین seam را «نام‌گذاری‌شده» اعلام کرد: `localStorage["lc-settings"]`
**فقط** توسط `saveSettingsLocal` نوشته و **فقط** توسط `defaultSettings()` خوانده می‌شود. بررسی کد این را
رد کرد: دو نویسنده بود (`updateSettings` هم می‌نوشت)، و `main.tsx` پیش از اولین paint خودش مستقیم
`getItem` می‌کرد. کل توجیهِ مجاز بودنِ این seam همان «یک نویسنده، یک خوننده» بود — و برقرار نبود.

## Decision

- دو تابع در `src/lib/core.ts`: `readSettingsLocal()` و `writeSettingsLocal(patch)`، به‌همراه
  `clearSettingsLocal()`. هر سه در نبودِ `localStorage` بی‌صدا و بی‌خطا عمل می‌کنند.
- `core.ts` و نه `store.ts`: چون `state.ts#defaultSettings` زیر `store.ts` است (قانون ۵) و نمی‌تواند از آن
  import کند، و چون `main.tsx` پیش از mount به مقدار نیاز دارد. `core` پایین‌ترین لایه است و مالک I/O.
- هیچ فایل دیگری `localStorage` را برای تنظیمات صدا نمی‌زند — `main.tsx`، `state.ts` و `store.ts` هر سه
  از همین دو تابع عبور می‌کنند. `test-helpers.ts` آن‌ها را export می‌کند تا تست‌ها هم مسیر واقعی را بروند.

## Why

یک seam که دو نویسنده دارد، seam نیست؛ یک عادت است. تا وقتی خواندن و نوشتن پراکنده بود، «چه چیزی در
تنظیماتِ محلی می‌نشیند» پاسخِ یک grep بود، نه پاسخِ یک قرارداد. دو تابع، آن را دوباره قرارداد می‌کند:
قاعده‌ای که می‌شود با یک تست نگه داشت (`settings-local.test.ts`) نه با حافظه‌ی نفر بعدی.

## Consequences

- `writeSettingsLocal` **merge** می‌کند، نه جایگزینی: تا `updateSettings` نتواند ناخواسته کلیدی را پاک کند.
- بازیابی (`Recover & rebuild` در `main.tsx`) از `clearSettingsLocal()` می‌رود؛ یعنی اگر روزی کلیدِ دیگری
  به تنظیمات اضافه شود، پاک‌کردنش یک جا تصمیم گرفته می‌شود.
- نرمال‌سازی (id نامعتبر تم، `snapToGrid` غیربولی) در `defaultSettings()` می‌ماند؛ §9.5 بدهیِ خودش را دارد
  و این ADR آن را حل نمی‌کند — فقط محلِ خواندن را یکی می‌کند.
