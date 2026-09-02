---
title: مشخصات ظاهر — نقشه‌ای که قبل از آجرچینی کشیده می‌شود
status: draft
updated: 2026-09-02
sources: [docs/ARCHITECTURE.md#6, src/index.css, docs/patterns/node-inspector.md, docs/inbox.md, scripts/check-palette.mjs, src/lib/__tests__/theme.test.ts, docs/decisions/adr-006-theme-is-device-scoped.md]
related: [docs/ARCHITECTURE.md, docs/patterns/node-inspector.md, docs/inbox.md, docs/decisions/adr-006-theme-is-device-scoped.md]
---

# مشخصات ظاهر (UI Spec)

این سند **تصمیم‌های ظاهری** را نگه می‌دارد، نه مکانیزم را. «کد چطور کار می‌کند» همچنان فقط در
`docs/ARCHITECTURE.md#6` نوشته می‌شود و این فایل هیچ‌وقت آن را تکرار نمی‌کند؛ کاری که اینجا می‌کنیم این است که
بگوییم هر چیز روی صفحه **باید** چه شکلی، چه اندازه‌ای و چه رفتاری داشته باشد.

دلیل وجودش یک واقعیت است: هوش مصنوعیِ بدون دسترسی به کد (و آدمِ خسته) نمی‌توانند با توصیفِ ذهنی ظاهر را دقیق
در بیاورند. پس این سند یک جدول است، نه نثر.

## ۰. تعریف «یک ادعای ظاهری تمام‌شده»

هر ردیف در این سند (و هر ردیفی که از تحقیق روی Figma/VS Code/Excalidraw برمی‌داریم) باید پنج چیز داشته باشد؛
کم‌بودن یکی‌اش یعنی ردیف هنوز تصمیم نیست:

| فیلد | یعنی |
|---|---|
| **مقدار** | عدد با واحد: `12px`، `#0b1312`، `۱.۶s`، `cubic-bezier(0.4,0,0.6,1)` — «کمی برجسته‌تر» مجاز نیست |
| **وضعیت** | `implemented` (الان در کد هست) / `proposed` (باید ساخته شود) / `rejected` |
| **منبع** | از کدام ابزار الگو گرفته‌ایم و دقیقاً کدام رفتار آن را می‌خواهیم |
| **محل ذخیره** | این تنظیم کجا زندگی می‌کند: frontmatter نود / `canvas.yaml` / `localStorage` / فقط UI-state |
| **ارجاع** | تست، یا بخش `ARCHITECTURE.md` که مکانیزش را توضیح می‌دهد |

قاعدهٔ آخر مهم‌ترین است: **هر چیزی که «شخصی‌سازی» نامیده می‌شود، یک فایل می‌خواهد یا یک کلید localStorage**
(قانون ۱). «تم زیبا» بدون محلِ ذخیره، یک نقاشی است، نه فیچر.

## ۱. چهار لایه، جدا از هم

این تفکیک از پیشنهاد شریک طراحی آمده و همان چیزی است که گپ‌های قبلی را می‌بندد:

1. **چیدمان فضایی** — پنل‌ها کجا هستند، عرض‌شان چقدر است، docking داریم یا نه.
2. **رفتار تعاملی** — هاور، درگ، کلیک-راست، ساخت یال، حالت draw.
3. **وضعیت‌های بصری** — هر عنصر در idle/running/done/failed/waiting/locked چه شکلی است.
4. **پوسته و شخصی‌سازی** — توکن‌ها، تم، و اینکه کاربر چه چیزی می‌تواند عوض کند و کجا ذخیره شود.

لایهٔ ۴ روی بقیه حکم دارد ولی برعکسش ممنوع: هیچ رنگی در کامپوننت سخت‌کد نمی‌شود، همه از `@theme`
(`src/index.css`) می‌آیند. امروز این قاعده کامل رعایت نشده — §۹.

## ۲. پنج منطقه (وضعیت امروز، از روی کد)

| منطقه | امروز | فاصله/وضعیت |
|---|---|---|
| نوار بالا | نام بوم، چیپ «phase 1 closed»، چیپ ذخیره/حالت ذخیره، checkpoint دستی، تاریخچه، تنظیمات، کنترل‌های اجرا | `implemented` |
| پنل چپ | عرض از `canvas.layout.leftWidth` (پیش‌فرض `268px`)، دو تب Library/Files، لبهٔ کشیدنی، دکمهٔ جمع‌شدن در نوار وضعیت | `implemented` — §۲.۱ |
| بوم | React Flow؛ `minZoom 0.15 / maxZoom 2.2`؛ `Background` نقطه‌ای: `gap 26`، `size 1.4`، رنگ `#22383440`؛ MiniMap بالا-راست (pannable+zoomable)؛ Controls پایین-چپ | `implemented` |
| پنل راست | عرض از `canvas.layout.rightWidth` (پیش‌فرض `292px`)، بازرس نود/یال/بوم، لبهٔ کشیدنی | `implemented` — §۲.۱ |
| شناورها | ChatPanel · FileViewer · HistoryModal · SettingsModal · PortModal · Toasts · BootOverlay | `implemented`؛ SettingsModal یک بخش **Appearance** دارد: تم + «snap به گریدِ ۲۶» (`src/components/Overlays.tsx#SettingsModal`) |
| ذخیرهٔ تنظیمات ظاهری | `lc-settings` در localStorage، فقط از راه `src/lib/core.ts#writeSettingsLocal` | `implemented` طبق `docs/decisions/adr-006-theme-is-device-scoped.md` و `adr-007-settings-live-behind-two-functions.md` — و **هیچ** کلید ظاهری در `canvas.yaml` نیست، عمداً |
| نوار وضعیت پایین | `22px` (`src/lib/core.ts#STATUS_BAR_HEIGHT`)، چپ: عنوان + شمارش + حالت ذخیره؛ راست: وضعیت اجرا + ذخیره + پنل‌ها | `implemented` — §۲.۱ |
| حالت تمرکز | `Ctrl+K Z` روشن، `Escape` دو بار خاموش؛ هر دو پنل و کنسول پنهان | `implemented`؛ بدون ذخیره فایلی |
| چرخه ابزار مدل | فراخوانی ابزارهای ده‌گانه بوم توسط مدل، ثبت در Run Ledger و نمایش زنده در گراف | `implemented` طبق `docs/decisions/adr-022-function-calling-loop-and-canvas-tools.md` |

### ۲.۱ اعداد چیدمان (هر کدام یک ادعا، هر ادعا یک محل ذخیره)

| مورد | مقدار | محل ذخیره | ارجاع |
|---|---|---|---|
| عرض پنل چپ / راست | پیش‌فرض `268px` / `292px`، بازهٔ مجاز `200px`…`520px` | `canvas.yaml` → `layout.leftWidth` / `layout.rightWidth` | `src/lib/core.ts#PANEL_MIN`، `layout.test.ts` |
| باز/بسته بودن پنل‌ها | بولین؛ نبودنِ کلید یعنی **باز** | `canvas.yaml` → `layout.leftOpen` / `rightOpen` | `src/lib/core.ts#normalizeLayout` |
| دستهٔ کشیدن | `5px`، `cursor-col-resize`، hover با `lc-accent/40` | — (کروم) | `src/components/SidePanels.tsx#ResizeHandle` |
| debounce نوشتن چیدمان | `500ms` بعد از آخرین حرکت | — | `src/lib/engine.ts#touchLayout` |
| ارتفاع نوار وضعیت | `22px`، متن `9.5px`، `border-t ink-700` | — (کروم) | `src/components/Overlays.tsx#StatusBar` |
| اسکرولِ محتوا | `flex-1 min-h-0 overflow-y-auto overscroll-contain`؛ `min-h-0` نیمهٔ باربر است. چهار مودال هم `max-h-[…vh] flex flex-col` دارند | — (کروم) | `SidePanels.tsx#LeftPanel`، `Overlays.tsx#SettingsModal`، `interactive.test.tsx` |
| پنل گپ | جایش از `canvas.layout` و `ui.focusMode` و `ui.consoleOpen` **محاسبه** می‌شود (نه عددِ ثابت)، و دکمهٔ بستن `shrink-0 ms-auto` + `aria-label` + `data-lc-chat-close` دارد | `canvas.yaml` → `layout` | `src/components/Overlays.tsx#ChatPanel` |
| نشانِ living-canvas | **بی‌حرکت**؛ هیچ `anim-breathe` یا `anim-spin-slow`؛ رنگ از `lc-accent` | — (کروم) | `src/components/Overlays.tsx#Logo` |
| تمِ پیش‌فرض | `botanical`؛ تمِ `plum` accent یشمی دارد چون مرکبش بنفش است | `lc-settings` (ADR-006) | `src/lib/core.ts#DEFAULT_THEME`، `docs/decisions/adr-010-accent-is-a-role-and-plum-is-default.md` |
| حالت تمرکز | بولین، فقط حافظه | **هیچ فایلی** | `docs/decisions/adr-009-layout-is-canvas-content-focus-mode-is-not.md` |
| زمانِ مجاز بین دو کلیدِ `Ctrl+K` و `Z` | `1500ms` | — | `src/lib/core.ts#createChord` |
| فاصلهٔ دو `Escape` | `400ms` | — | `src/lib/core.ts#createDoubleTap` |

**تصمیم‌های بازِ همین بخش** (در `docs/inbox.md` با اولویت): docking/collapse پنل‌ها، نوار وضعیت واقعی، و
«Focus Mode» که هر سه پنل کناری را مخفی می‌کند.

## ۳. توکن‌ها — جدول واقعی (و هر ادعای عددی باید به همین مرجع باشد)

از `src/index.css`:

| توکن | مقدار | کاربرد |
|---|---|---|
| `ink-950` | `#0b1312` | پس‌زمینهٔ پایه (پیش‌نویس بیرونی `#0b0d12` گفت: **غلط**) |
| `ink-900` / `850` / `800` / `700` | `#0f1a19` `#12201e` `#162624` `#1e3230` | سطوح پنل، کارت، خط |
| `ink-600`→`ink-50` | `#2a423f` `#3c5854` `#5f7b76` `#8ba39d` `#b4c6c0` `#dce5e1` `#eef2ef` | متن ثانویه تا متن اصلی (`ink-50` = `#eef2ef`، نه `#e5e7eb`) |
| **`lc-accent`** (نقش) | `#b98bc2` · در تم پلام `#cfa6da` | کنش اصلی، حلقهٔ focus، نشانِ living-canvas، یال flow، وضعیت running |
| **`lc-warn`** (نقش) | `#d9c9a3` | متن و toast هشدار — عمداً غیر از accent، تا هشدار هرگز «دعوت به کلیک» خوانده نشود |
| `amber-lc` | `#e8b04b` | **فقط دادهٔ بوم**: `NODE_COLORS.agent`، سواچ‌های رنگِ نود، پالت قلم. هیچ کرومی رنگش نمی‌کند (ADR-010) |
| `ember` | `#e06a4e` | خطا، خطر، رد شدن |
| `sage` / `sky-lc` / `plum` / `sand` | `#8fbf7f` `#6fb3c7` `#b98bc2` `#d9c9a3` | موفقیت / اطلاعات-یادداشت / pipeline-step و built-in / پوشه |
| فونت‌ها | Inter (متن) · Space Grotesk (عنوان) · IBM Plex Mono (مسیر، id، عدد) | از Google Fonts در `index.html` بارگذاری می‌شوند |
| انیمیشن‌های ورود | `anim-rise 0.28s` · `anim-pop 0.22s` · `anim-fade 0.3s` · `anim-toast 0.3s` · `anim-boot 0.25s` | همه با `cubic-bezier(0.2,0.7,0.3,1)` |

هر پیشنهاد تم جدید باید بگوید **کدام** از این توکن‌ها عوض می‌شوند؛ اگر فقط یک رنگ جدید لازم دارد، یک توکن جدید
در `@theme` است، نه هگز داخل JSX.

سه قاعده که از «سلیقه» بیرون آمده‌اند و `scripts/check-palette.mjs` اجرایشان می‌کند:

1. **کامپوننت نقش می‌نامد، رنگ نه.** رنگِ literal فقط در سه جور بلوکِ `src/index.css` مجاز است: `@theme`،
   بلوک نگاشت نقش‌ها (`:root`)، و یک بلوک به‌ازای هر تمِ غیرپیش‌فرض. هر جای دیگر یا `var()` است یا کلاس
   (`.lc-card-surface` · `.lc-card-empty` · `.lc-fail-band`).
2. **React Flow از متغیرهای CSS خودش تم می‌گیرد** (`--xy-background-pattern-color`, `--xy-minimap-background-color`,
   `--xy-minimap-mask-background-color`) — پراپ‌های `color`/`maskColor`/`style` حذف شدند، چون به inline style
   تبدیل می‌شوند و inline style بر هر تمی غلبه می‌کند.
3. **کنتراست عدد است، نه حس.** شش نقش (متن، عنوان، متن کم‌رنگ، کنش، خطا، موفقیت) روی `ink-950` *همان تم*
   با luminance استاندارد سنجیده می‌شوند و تمِ جدید اجازه ندارد کم‌رنگ‌تر از پیش‌فرض باشد.

تم‌پذیریِ شفافیت‌ها هم شرط دارد: Tailwind برای `bg-ink-950/80` یک literalِ زمان build و یک نسخهٔ
`color-mix(… var(…))` پشت `@supports` می‌نویسد؛ مرورگرِ بدون `color-mix` تم دوم را نصفه می‌بیند — پذیرفته‌شده،
چون هدف مرورگرِ مدرن است نه قدیمی.

## ۴. نود

- ۸ نوع (`note · agent · folder · output-box · pipeline-step · file · shape · drawing`)، ۶ شکل
  (`rectangle · circle · diamond · hexagon · card · empty`)، ۴ حالت نمایش (`dot · name · card · markdown`) —
  همه در `src/lib/core.ts` تعریف شده‌اند و همه در فایل نود ذخیره می‌شوند.
- **نقشهٔ وضعیت → ظاهر** (مقادیر موجود؛ خانه‌های خالی = پیشنهاد که باید عدد بگیرند):

| وضعیت | امروز در کد | پیشنهاد (باید عدد بگیرد) |
|---|---|---|
| `idle` | بدون حلقه، رنگ نود در `boxShadow: 0 0 0 1px {color}33` | — |
| `running` | `.anim-running` = حلقهٔ موجی ۱۴px، `1.6s cubic-bezier(0.4,0,0.6,1)` بی‌نهایت | حفظ همین؛ سرعت به `animation.speed` نود مقیاس کند |
| `done` | رنگ `sage` در چیپ وضعیت؛ `.anim-breathe` = scale 1.018 با 3.2s (اگر کاربر انتخاب کرده باشد) | تیک کوچک + یک‌بار flash، بدون انیمیشن دائمی |
| `failed` | باند پایین کارت با `ember` + متن `execution.errors`؛ چیپ `Failed` | **lrzesh یک‌باره (shake 0.18s)** `proposed` — امروز نیست |
| `waiting` | `.anim-waiting` = موج ember با `1.4s` + نقطهٔ چشمک‌زن | یک دکمهٔ واقعی Approve/Reject روی خود کارت، نه فقط بنر بالا |
| `locked` | آیکون قفل گوشهٔ نود؛ کلاس `.lc-locked-panel` (محو + `pointer-events:none`) **فقط روی پنل بازرس** موقع اجرا اعمال می‌شود | همان رفتار روی کارت نود هم اعمال شود؟ → `docs/inbox.md` |

- **handleها**: ۹×۹px، `background #0f1a19`، `border 2px solid #e8b04b`، `opacity 0` و با هاور/سِلکت رو‌به‌۱ در
  `0.15s ease`. یعنی «دسته‌ها فقط موقع نیاز پیدا می‌شوند» از قبل تصمیم گرفته شده — اگر Figma رفتار دیگری دارد،
  باید استدلال بیاورد نه فقط نام.
- **سِلکت**: `.lc-node-selected` = `brightness(1.15) saturate(1.1)`؛ هیچ اوت‌لاینی اضافه نمی‌شود.
- **عرض کارت ثابت است** (`w-[264px]`)؛ resize در دسترس نیست (هیچ `NodeResizer` نیست). هر طرحِ «تغییر اندازه»
  یعنی `width/height` در frontmatter نود → تغییر فرمت فایل → ADR، نه CSS.
- **ویرایش متن روی خودِ بوم**: `implemented` برای `viewMode: markdown` — دابل‌کلیک بلاکِ رندرشده را با یک
  `<textarea>` عوض می‌کند؛ `Escape` لغو، `⌘/Ctrl+Enter` و blur ثبت؛ ذخیره از همان `updateNodeData` می‌رود پس
  فایلِ نود بلافاصله نوشته می‌شود (قانون ۱) و `mdInline` تنها درِ رندر می‌ماند (قانون ۲).
  `contentEditable` **رد شد**: یعنی HTMLِ خام حالتِ برنامه. حالت‌های `card`/`name` هنوز ویرایش درجا ندارند
  (`proposed`)، چون اول باید جای «عنوان» و «بدنه» روی کارت تعیین شود.
- **حالت‌های رنگ**: رنگِ خودِ نود/یال/stroke داده است و تم عوضش نمی‌کند؛ فقط روِ برنامه (پنل‌ها، کارت،
  scrollbars، کنترل‌ها، نقطه‌ها) تم‌پذیر است. اگر یک تمِ آینده رنگ‌های تأکید را هم عوض کند، جدول‌های
  `STATUS_COLOR`/`EDGE_COLOR`/`EVENT_COLOR` در `src/components/` باید به توکن تبدیل شوند — سؤالش در
  `docs/inbox.md` است، نه یک کارِ تعویق‌افتاده.

## ۵. یال

- ۵ نوع: `flow · relation · event-flow · blackboard · direct-message` ✓ همان پنج‌تایی که پیش‌نویس بیرونی گفت.
- استایل خط از کلاس‌های واقعی: `lc-edge-flow` = dash `7 5` با انیمیشن `0.9s linear`؛ `lc-edge-dashed` = `8 6`؛
  `lc-edge-dotted` = `2 6` با `stroke-linecap: round`؛ `lc-edge-pulse` = تپش opacity `1.8s`؛ سِلکت =
  `stroke #e8b04b`.
- شرط روی یال امروز **برچسب اختیاری** است، نه نمایش خودِ شرط؛ «یک pill با متن شرط» `proposed` است و باید بگوید
  اگر شرط ۸۰ نویسه شد چه می‌شود (کِریپ؟ تولتیپ؟).
- «ضخامت بر اساس حجم داده» و «نمای عملکرد» هنوز هیچ داده‌ای پشتشان نیست؛ تا وقتی خروجی عددیِ غیر از
  `numericScope` نداریم، `rejected for now` (ببین `docs/research/summaries/feature-pool.md` §۲).

**گرید و اسنپ** (بوم): `GRID_GAP = 26` تنها عددِ این بحث است و هم فاصلهٔ نقطه‌هاست هم `snapGrid`؛ عدد ۲۰ که در
ماتریس Excalidraw بود رد شد، چون با نقطه‌های ما هم‌خط نیست و «اسنپِ کج» بدتر از نبودنِ اسنپ است. اسنپ
**خاموش** است و از تنظیمات روشن می‌شود، چون `position` را در فایل هر نود بازنویسی می‌کند — یعنی تغییرِ سند، نه
تغییرِ نما. خط‌راهنماهای point/gap snaps هنوز `proposed` است (هزینه‌اش محاسبهٔ هندسه در هر فریم است) و تا قبل از
اندازه‌گیری روی ~۲۰۰ نود تعریف نمی‌شود.

## ۶. بازرس (پنل راست)

بخش‌هایی که **هستند**: Display & shape · Content · Agent configuration · Context contract (دو گروه مسیر
خواندن/نوشتن) · کتابخانهٔ قالب‌ها · اعتماد حافظه · دکمهٔ self-test. چهار چیزی که **نیست** و لازم‌اند، در
`docs/patterns/node-inspector.md` مفصل آمده‌اند (لینک `runs/<run-id>.md`، متن خطا با دکمهٔ کپی، نمایش مسیر
`validator` و اینکه فایلش پیدا می‌شود یا نه، و لینک فایل حافظه).

یک ردیف جدید که ارزش اضافه‌اش زیاد است و هزینه‌اش پایین — از همان پیش‌نویس بیرونی، اصلاح‌شده:

| مورد | مقدار پیشنهادی | محل ذخیره | وضعیت |
|---|---|---|---|
| انتخاب `validator` از فهرست `library/schemas/*.schema.json` یا `null` | dropdown + یک خط پیش‌نمایش «فیلدهای اجباری: ۴» | `output_contract.validator` در همان فایل نود | `proposed` |

این تنها راهِ قابل‌دسترس «سخت کردن/نرم کردن قرارداد» برای کاربر است و گپ §۹.2 در
`docs/ARCHITECTURE.md#9` را می‌بندد؛ پس از «قشنگی» نیست، از نوع «قرارداد بدون آن توهم است».

## ۷. پنل کتابخانه و فایل

- Palette: کارت برای هر نوع نود؛ درگ روی بوم = ساخت در همان نقطه، کلیک = در مرکز ویوپورت ✓ پیاده.
- Files: درخت فایل؛ در حالت پوشه‌ی زنده از روی دیسک خوانده می‌شود و با هر `saved` رفرش می‌شود ✓.
- **هیچ قالب آماده‌ای shipped نمی‌شود** (`library/templates/` خالی است، عمداً — `docs/ARCHITECTURE.md#5.3`).
  پس «کتابخانهٔ قالب خالی است» باگ نیست؛ اگر برای آنبوردینگ دردناک است، راهش یک قالبِ انسانی‌ساخته است نه بازگشت
  دمو.
- `library/visual-styles/` که پیش‌نویس بیرونی فرض کرده بود **وجود ندارد** و با `library/shapes/` هم معنایش
  همپوشانی دارد → تصمیمش در `docs/inbox.md` است، نه در این سند.

## ۸. پس‌زمینه، شیشه، ستاره

- پس‌زمینهٔ امروز در کلاس `.lc-bg`: یک `linear-gradient` سه‌تکه از `--lc-bg-top/mid/bottom` + سه
  `radial-gradient` کم‌شدت (`--lc-glow-plum` بالا-راست، `--lc-glow-sky` پایین-چپ، `--lc-glow-sage` مرکز). «عمق» از قبل بود؛ حالا تم‌پذیر هم هست، چون هر شش توکن در هر بلوکِ تم مقدار می‌گیرند.
- **ستاره‌ها و بنفش الکتریکی**: در تحقیق به‌عنوان «ترجیح کاربر» نوشته شده بودند و در این ریپو هیچ‌جا توسط خودِ
  کاربر اعلام نشده‌اند. تا تأیید نشده‌اند، `proposed` هم نیستند → `docs/inbox.md` (سؤال P0).
- اگر یک‌روز تصدیق شد: یک لایهٔ CSS پشت React Flow، بدون canvas overlay و بدون انیمیشن دائمی، و تنظیمش همان‌جا که تم ذخیره می‌شود — نه در JSX.

## ۹. بدهی‌های ظاهری که همین‌جا ثبت می‌شوند (نه در چت)

1. ~~هگزهای سرگردان~~ **بسته شد** (۲۰۲۶-۰۹-۰۲): رویه به `var()` رفت و `scripts/check-palette.mjs` هگز بیرون توکن‌ها را منع می‌کند؛ جدول‌های نقش→رنگ در `src/components/` به تصمیم accent در تم بند است (`docs/inbox.md`).
2. **`React.memo` هیچ‌جا نیست** (برخلاف ادعای پیش‌نویس بیرونی). با سلکتورهای فعلی قابل‌دفاع است، ولی اولین
   بهینه‌سازیِ واقعی همین است، نه quadtree.
3. **کیبورد هنوز تقریباً صفر است**: `Backspace/Delete` برای حذف، Enter در کامپوزر چت، و حالا `Enter/Escape`
   داخل ویرایشِ متنِ نود. ولی `Tab` به بوم نمی‌رسد، focus-ring روی نودها نیست، toats با `aria-live` اعلام
   نمی‌شوند — همان زخم ۹ در `docs/ARCHITECTURE.md#9`.
4. **دکمهٔ اجرای بصریاً مثل بقیه است**؛ «Primary» بودن باید از توکن بیاید نه از شانس.
5. **متن‌های UI هنوز sizeهای سلیقه‌ای دارند** (`text-[11.5px]`, `text-[9.5px]`, `leading-[13px]`); تا به یک
   مقیاس ۴تایی جمع نشوند، «typography scale» ادعاست نه واقعیت.
6. **حذف چند نود با یک کلیکِ Delete، چند toast می‌سازد** — `deleteNode` برای هر نود پیام خودش را می‌فرستد.
   درستش یک پیامِ گروهی است («۳ نود و یال‌هایشان حذف شد»)، ولی `deleteNode` پارامتر quiet ندارد و افزودنش
   یعنی تغییرِ امضای engine: کارِ کوچک، با یک خطِ ADR-نخواهد، فقط یک تصمیمِ کوچک.
7. **`elevateNodesOnSelect` روشن است**؛ اگر روزی `position.z` را در بازرس دستی کنیم، باید گفته شود کدام برنده
   است — امروز سِلکت فقط بصری بالا می‌آورد و فایل را تغییر نمی‌دهد.

## ۱۰. تعریف «ظاهر تمام‌شده» برای یک فاز

یک فازِ ظاهری تمام است وقتی، و فقط وقتی:

- هر ردیفِ §۲ تا §۸ یا `implemented` است یا به یک ردیف در `docs/roadmap/` وصل شده؛
- هر عدد جدید از یک توکن/فرمت فایل می‌آید، نه از JSX (قانون ۱ و ۲ هم‌زمان);
- `npx vitest run` سبز است و اگر رفتار حالت عوض شده، یک تست برای همان حالت نوشته شده (نه فقط اسکرین‌شات);
- `node scripts/check-docs.mjs`، `node scripts/check-english.mjs` و `node scripts/check-palette.mjs` سبزند
  (ادعاهای این سند به کد ارجاع می‌دهند، و ادعاهای رنگی‌اش به عدد);
- و کاربر خودش یک بار بدون خواندن مستندات: نود بسازد، وصل کند، ران کند، و بداند چرا چیزی رد شده. تا این
  پنج‌تا سبز نباشند، «زیبا شد» معنای فنی ندارد.

## ۱۱. این سند چه چیزی **نیست**

مکانیزم (→ `docs/ARCHITECTURE.md`)، زمان‌بندی (→ `docs/roadmap/`)، و تصمیمِ هویتی محصول
(→ `docs/notes/ideas.md#Product identity`). هر ادعای «الان اینطور است» در اینجا از کد برداشته شده و هر «باید اینطور
شود» `proposed` است؛ اگر عددی را نمی‌دانیم، در جدول نوشته‌ایم که نمی‌دانیم — و این تنها راهی است که سند بعدی
بتواند به‌جای حدس‌زدن، عدد بیاورد.
