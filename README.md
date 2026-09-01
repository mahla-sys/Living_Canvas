# Living Canvas — بوم زنده

بوم بی‌نهایتِ فایل‌محور برای فکر کردن، طراحی و اجرای سیستم‌ها: هر نود، یال، حافظه و خروجی یک فایل مستقل است و انسان و AI روی یک بوم کار می‌کنند.

**وضعیت:** فاز ۱ (هستهٔ بوم + ایجنت‌ها + حافظه + چک‌پوینت) تمام شده — نسخهٔ `0.1.x`، همراه با الحاقیهٔ ۱.۴ که سند را با کد هم‌راستا می‌کند.

## اجرا

```bash
npm install
npm run dev        # http://localhost:3000
npm run typecheck  # tsc --noEmit
npm test           # vitest run (۶۱ تست)
npm run build      # خروجی dist/
```

## مستندات

| سند | نقش |
|---|---|
| `Living_Canvas-main/# سند معماری Living Canvas — نسخه 1.3.md` | مرجع اصلی + **الحاقیهٔ ۱.۴** (مقدم بر متن ۱.۳ در صورت تناقض) |
| `Living_Canvas-main/(UI UX Spec) — Living Canvas.md` | رابط کاربری — پیش‌نویس، پیاده‌سازی نشده |
| `Living_Canvas-main/Living canvas + Nexus + City AI.md` | چشم‌انداز Nexus/شهر زنده — **منسوخ در مواردی که با v1.3 فرق دارد** (انواع نود/یال، ساختار `/projects`) |

## معماری در یک نگاه

```
src/lib/core.ts      تایپ‌ها، Event Bus، سریال‌ساز YAML/Markdown، StorageAdapter (IndexedDB / HTTP / حافظه)
src/lib/fs-access.ts StorageAdapter روی File System Access API — «حالت پوشه‌ی زنده»
src/lib/portable.ts  Export/Import فایل‌محور + بازسازی بوم از خودِ فایل‌ها
src/lib/engine.ts    MemoryManager (§6)، Executor (§7)، چک‌پوینت (§10)، ذخیره‌سازی debounce
src/store.ts         Zustand store — اکشن‌های UI
src/components/      CanvasArea (React Flow + لایه‌ی نقاشی)، SidePanels، Overlays
```

سه اصل اجرایی که در کد گارانتی شده‌اند (تست دارند):

1. **`state.json` کش است، نه منبع حقیقت.** بوم بدون آن هم از `nodes/*.md` + `edges/*.yaml` + `memory/*.md` بازسازی می‌شود؛ ویرایش دستی در Obsidian/Git بعد از رفرش باقی می‌ماند.
2. **قرارداد §9 روی نوشتن اعمال می‌شود** (`allowed_write_paths` + قفل نود + تعارض `confidence`). خواندنِ خروجی نود بالادست هنوز از این قرارداد عبور نمی‌کند — باز هم مسیر باز است.
3. **هر متنی که AI می‌تواند تولید کند، پیش از رندر escape می‌شود** (`mdInline`؛ تنها `strong/em/code` مجازند).

## Export / Import

- **دانلود فایل بوم** → یک `<canvas-id>.livingcanvas.json` شامل تمام فایل‌های §2 (با اعتبارسنجی مسیر، نسخه، و پیش‌نمایش قبل از جایگزینی).
- **کپی در یک پوشه** / **بارگذاری از پوشه** → درخت واقعی فایل‌ها روی دیسک.
- **حالت پوشه‌ی زنده** (Chrome/Edge): یک بار پوشه انتخاب می‌کنی؛ از آن به بعد هر تغییر عیناً روی دیسک نوشته می‌شود — Git و Obsidian روی همان پوشه کار می‌کنند و «بازخوانی از دیسک» تغییرات بیرونی را برمی‌دارد.

## نکات شناخته‌شده

- ذخیره‌سازی پیش‌فرض IndexedDB است؛ تا وقتی به پوشه وصل نشوی یا export نگیری، داده در همین مرورگر است.
- `HttpStorageAdapter` برای فاز ۲ (FastAPI) آماده است ولی کلید API فعلاً در `localStorage` مرورگر می‌ماند — برای استقرار عمومی باید به پروکسی بک‌اند منتقل شود.
- اعتبارسنجی خروجی فعلاً «وجود فایل‌های الزامی» است؛ JSON Schema واقعی (`schemas/*.schema.json`) هنوز نوشته نشده.
