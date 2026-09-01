

> **نسخه:** 1.3  
> **تاریخ:** 2026-08-23  
> **وضعیت:** تأییدشده برای شروع پیاده‌سازی فاز ۱  
> **مخاطب:** توسعه‌دهنده‌ی انسانی یا هوش مصنوعی  
> **هدف:** ساخت هسته‌ی اولیه‌ی Living Canvas برای استفاده‌ی شخصی، با معماری آماده برای استقرار روی سرور، بهینه‌سازی کارایی، و مهاجرت آینده به LangGraph.

---

## ۱. معرفی و اهداف

### ۱.۱ چشم‌انداز

Living Canvas یک بوم بی‌نهایت زنده برای تفکر، طراحی و اجرای سیستم‌هاست.  
در این بوم، هر نود، یال، نقاشی، خروجی و حافظه یک فایل مستقل است.  
انسان و هوش مصنوعی هر دو با یک بوم یکسان کار می‌کنند، اما هیچ‌کدام مجبور نیستند کل سیستم را بفهمند.  
هر عامل فقط بر اساس «قرارداد زمینه» خودش عمل می‌کند.

### ۱.۲ اهداف فاز ۱

- ساخت بوم بصری بی‌نهایت با React Flow.
- ذخیره‌سازی تمام عناصر در ساختار فایل‌محور (Markdown + YAML + JSON).
- تعریف نقش‌های آماده برای ایجنت‌ها و امکان شخصی‌سازی.
- اتصال هوش مصنوعی با ابزارهای محدود و کنترل‌شده.
- پیاده‌سازی حافظه‌ی دو سطحی (سراسری و اختصاصی) با MemoryManager.
- مدیریت خطا، قفل‌گذاری، چک‌پوینت و بازگشت به عقب.
- طراحی StorageAdapter برای کارایی و آمادگی استقرار روی سرور.
- طراحی Execution Engine سبک برای فاز ۱ و هماهنگ با LangGraph برای فاز ۲.

### ۱.۳ اصول بنیادین

1. **بوم منبع حقیقت است، اما فایل‌ها پایه‌ی ذخیره‌سازی هستند.**
2. **هوش مصنوعی کل بوم را نمی‌خواند؛ فقط خلاصه، بریف خودش و فایل‌های مجاز را می‌خواند.**
3. **هر نود، یال، نقش، خروجی و حافظه یک فایل مستقل است.**
4. **هیچ ایجنتی به‌طور مستقیم با ایجنت دیگر حرف نمی‌زند، مگر از طریق Blackboard یا Direct-Message تعریف‌شده.**
5. **خروجی‌ها جداگانه و قابل بازیابی هستند.**
6. **قالب‌ها و نقش‌ها قابل ذخیره و نسخه‌بندی هستند.**
7. **حافظه باید هوشمند، لایه‌ای و قابل تکامل باشد.**
8. **کارایی و مشاهده‌پذیری باید از ابتدا در معماری لحاظ شود.**

---

## ۲. ساختار پوشه‌ی پروژه

هر بوم (Canvas) یک پوشه است با ساختار زیر:

```
/canvases/
└── <canvas-id>/
    ├── manifest.json
    ├── canvas.yaml
    ├── canvas-overview.md
    ├── graph.json
    ├── state.json                ← (افزوده در ۱.۴) کش وضعیت: حافظه/خروجی/چت/لاگ/اسنپ‌شات
    ├── nodes/
    │   ├── node-<node-id>.md
    │   └── ...
    ├── edges/
    │   ├── edge-<source>-<target>.yaml
    │   └── ...
    ├── strokes/
    │   ├── stroke-<stroke-id>.json
    │   └── ...
    ├── chats/
    │   ├── chat-<node-id>.md
    │   └── ...
    ├── outputs/
    │   ├── <node-id>/
    │   │   ├── summary.md
    │   │   ├── details.json
    │   │   └── index.yaml
    │   └── shared/
    │       └── output-box-<id>/
    │           ├── ...
    ├── memory/
    │   ├── global.md
    │   ├── decisions.md
    │   ├── progress.md
    │   ├── user.md
    │   ├── connections.md
    │   └── agents/
    │       ├── <node-id>.md
    │       └── ...
    ├── history/
    │   ├── snapshot-<timestamp>.json
    │   └── index.yaml
    ├── logs/
    │   ├── <node-id>/
    │   │   ├── <timestamp>.log
    │   │   └── ...
    │   └── ...
    ├── library/
    │   ├── shapes/
    │   │   └── <shape-name>.json
    │   ├── roles/
    │   │   └── <role-name>.json
    │   └── templates/
    │       ├── <template-name>/
    │       │   ├── template.yaml
    │       │   ├── nodes/
    │       │   ├── edges/
    │       │   ├── prompts/
    │       │   └── memory/
    │       └── ...
    └── assets/
        └── ...
```

**نکته:**  
در فاز ۱، این ساختار می‌تواند روی IndexedDB یا File System Access API شبیه‌سازی شود.  
در فاز ۲، با Backend و سیستم‌فایل واقعی سرور جایگزین می‌شود.  
برای این کار از لایه‌ی `StorageAdapter` استفاده می‌شود که در بخش ۷ تعریف شده است.

---

## ۳. فایل‌های اصلی و طرح‌واره‌ها

### ۳.۱ `manifest.json`

```json
{
  "version": "1.0",
  "canvas_id": "my-canvas",
  "structure_version": "1.3",
  "last_validated": "2026-08-23"
}
```

### ۳.۲ `canvas.yaml`

```yaml
id: "my-canvas"
title: "عنوان بوم"
created_at: "2026-08-23"
updated_at: "2026-08-23"
owner: "mahla"
default_model: "deepseek-chat"
canvas_type: "system-design"   # system-design | agent-pipeline | notes | free
tags:
  - nexus
  - school
template_id: "nexus-7-companies"
template_version: "1.0"
```

### ۳.۳ `canvas-overview.md`

```markdown
---
canvas_id: "my-canvas"
title: "عنوان بوم"
last_updated: "2026-08-23"
summary: |
  توضیح کوتاه هدف بوم و وضعیت فعلی.
current_step: "risk_analysis"
node_count: 12
edge_count: 11
---

# خلاصه‌ی بوم

اینجا توضیح کوتاهی از هدف بوم، ساختار کلی و وضعیت فعلی نوشته می‌شود.
هوش مصنوعی به‌جای خواندن کل بوم، اول این فایل را می‌خواند.
```

**قانون:**  
هر تغییر مهم در بوم (افزودن/حذف نود، تغییر وضعیت اجرا، پایان یک مرحله) باید این فایل را به‌روزرسانی کند.  
این فایل باید همیشه کوتاه و قابل فهم باشد.

### ۳.۴ فایل نود — `nodes/node-<id>.md`

```markdown
---
id: "node-001"
type: "agent"                     # note | shape | agent | folder | output-box | pipeline-step | file | drawing
title: "شرکت ۱ — فهم مسئله"
position:
  x: 120
  y: 220
  z: 0
size:
  width: 280
  height: 160
shape: "rectangle"                # rectangle | circle | diamond | hexagon | card | empty
color: "#3b82f6"
animation:
  type: "breathe"
  speed: 1.0
viewMode: "card"                  # dot | name | card | chat | markdown
style:
  strokeColor: "#000000"
  strokeWidth: 2
  fillStyle: "solid"
  opacity: 100
metadata:
  created_by: "mahla"
  updated_at: "2026-08-23"
lock:
  status: "free"                  # free | locked
  locked_by: null
  locked_at: null
agent:
  system_prompt: "prompts/company-1.md"
  model: "deepseek-chat"
  tools:
    - read_memory
    - write_memory
    - chat_with_user
  status: "idle"
  max_steps: 5
  max_tokens: 4000
  context_contract:
    allowed_read_paths:
      - "canvas-overview.md"
      - "nodes/node-001.md"
      - "memory/agents/node-001.md"
      - "outputs/previous-step/"
    allowed_write_paths:
      - "outputs/node-001/"
      - "memory/agents/node-001.md"
      - "logs/node-001/"
    output_contract:
      format: "markdown"
      required_fields:
        - summary
        - problem_statement
        - questions_asked
      validator: "schemas/company-1-output.schema.json"
      save_to: "outputs/node-001/"
---

# محتوای نود (اختیاری)

توضیحات اضافه درباره‌ی این نود.
```

**نکات مهم:**

- `lock` برای مدیریت همزمانی است. وقتی ایجنتی اجرا می‌شود، نود قفل می‌شود.
- `context_contract` مشخص می‌کند ایجنت چه فایل‌هایی را می‌تواند بخواند و بنویسد.
- ابزارهای فایل عمومی نداریم؛ فقط `read_memory` و `write_memory` و `write_output` داریم.
- `max_steps` و `max_tokens` محدودیت‌های اجرای ایجنت را تعیین می‌کنند.
- `validator` می‌تواند مسیر یک JSON Schema باشد یا در فاز ۱ یک بررسی ساده در کد.

### ۳.۵ فایل یال — `edges/edge-<source>-<target>.yaml`

```yaml
id: "edge-001"
source: "node-001"
target: "node-002"
type: "flow"                      # flow | relation | event-flow | blackboard | direct-message
label: "خروجی تحلیل"
line_style: "solid"               # solid | dashed | dotted
animation: "flow"                 # none | flow | pulse
trigger:
  type: "on_completed"            # on_completed | manual | condition
  condition: "{{ risk_score < 7 }}"
config:
  communication: "blackboard"     # blackboard | direct | none
  output_contract:
    format: "markdown"
    required_fields:
      - summary
      - risks
      - decision
    validator: "schemas/decision.schema.json"
```

### ۳.۶ خروجی‌ها

خروجی‌های هر نود در `outputs/<node-id>/` ذخیره می‌شوند.  
هر نود می‌تواند چند خروجی جداگانه تولید کند:

```
outputs/
└── node-001/
    ├── summary.md
    ├── problem_statement.md
    ├── questions_asked.json
    └── index.yaml
```

`index.yaml`:

```yaml
node_id: "node-001"
outputs:
  - file: "summary.md"
    type: "summary"
    description: "خلاصه‌ی مسئله"
  - file: "problem_statement.md"
    type: "detailed"
    description: "بیان دقیق مسئله"
```

**قانون:**  
قبل از ذخیره‌سازی خروجی، باید اعتبارسنجی با `validator` انجام شود.  
اگر خروجی فیلدهای required را نداشت، باید رد شود و خطا در لاگ ثبت گردد.

### ۳.۷ فایل‌های حافظه

#### حافظه‌ی سراسری — `memory/global.md`

```markdown
---
updated_at: "2026-08-23"
last_accessed: "2026-08-23"
confidence: 0.9
source: "system"
---
# وضعیت کلی پروژه

- هدف: ...
- پیشرفت: ...
- نکات مهم: ...
```

#### حافظه‌ی تصمیم‌ها — `memory/decisions.md`

```markdown
---
updated_at: "2026-08-23"
last_accessed: "2026-08-23"
confidence: 0.8
source: "system"
---
# تصمیم‌های مهم

- [2026-08-23] انتخاب فریم‌ورک: FastAPI
- [2026-08-22] معماری: ویجت‌محور
```

#### حافظه‌ی پیشرفت — `memory/progress.md`

```markdown
---
updated_at: "2026-08-23"
last_accessed: "2026-08-23"
confidence: 0.8
source: "system"
---
# کارهای انجام‌شده
- ایمپورت داده فاز ۱

# در حال انجام
- تحلیل ریسک

# بعدی
- استقرار
```

#### حافظه‌ی اختصاصی ایجنت — `memory/agents/<node-id>.md`

```markdown
---
agent_id: "node-001"
last_run: "2026-08-23"
status: "done"
confidence: 0.7
source: "agent"
last_accessed: "2026-08-23"
---
# حافظه‌ی این ایجنت

- آخرین ورودی‌ها: ...
- تصمیم‌های گرفته‌شده: ...
- نکات مهم برای اجرای بعدی: ...
```

**نکته:**  
`confidence` نشان‌دهنده‌ی اعتماد به اطلاعات است.  
`last_accessed` برای فراموشی هوشمند در فازهای بعد استفاده می‌شود.

### ۳.۸ نقش‌ها — `library/roles/<role-name>.json`

```json
{
  "id": "company-1-understander",
  "name": "فهم مسئله",
  "description": "گفتگو با کاربر برای شفاف‌سازی مسئله",
  "system_prompt": "prompts/company-1.md",
  "model": "deepseek-chat",
  "tools": ["read_memory", "write_memory", "chat_with_user"],
  "default_output_contract": {
    "format": "markdown",
    "required_fields": ["summary", "problem_statement", "questions_asked"],
    "validator": "schemas/company-1-output.schema.json",
    "save_to": "outputs/node-{node_id}/"
  },
  "default_context_contract": {
    "allowed_read_paths": ["canvas-overview.md", "memory/agents/{node_id}.md"],
    "allowed_write_paths": ["outputs/{node_id}/", "memory/agents/{node_id}.md"]
  }
}
```

### ۳.۹ شکل‌های آماده — `library/shapes/<shape-name>.json`

```json
{
  "id": "agent-card",
  "name": "کارت ایجنت",
  "type": "shape",
  "svg": "...",
  "default_size": { "width": 280, "height": 160 },
  "default_style": {
    "strokeColor": "#000000",
    "strokeWidth": 2,
    "fillStyle": "solid",
    "opacity": 100
  }
}
```

---

## ۴. Graph JSON Schema

گراف به صورت یک JSON سبک ذخیره می‌شود تا فرانت‌اند و Backend هر دو از یک ساختار استفاده کنند.

```json
{
  "canvas_id": "my-canvas",
  "version": "1.0",
  "nodes": [
    {
      "id": "node-001",
      "type": "agent",
      "label": "شرکت ۱",
      "position": { "x": 120, "y": 220 },
      "config_ref": "nodes/node-001.md"
    }
  ],
  "edges": [
    {
      "id": "edge-001",
      "source": "node-001",
      "target": "node-002",
      "type": "flow",
      "label": "خروجی تحلیل",
      "config_ref": "edges/edge-001.yaml"
    }
  ]
}
```

**نکته:**  
- جزئیات کامل هر نود در فایل Markdown مربوطه است، نه در `graph.json`.  
- `graph.json` فقط برای نمایش سریع و همگام‌سازی بین UI و موتور اجرا استفاده می‌شود.  
- هر تغییر در نودها/یال‌ها باید `graph.json` را به‌روزرسانی کند.  
- برای جلوگیری از نوشتن زیاد، به‌روزرسانی `graph.json` می‌تواند با debounce انجام شود.

---

## ۵. StorageAdapter (لایه‌ی ذخیره‌سازی)

برای این‌که سیستم روی IndexedDB، File System Access API یا سرور به یک شکل کار کند، یک `StorageAdapter` تعریف می‌کنیم.

```typescript
interface StorageAdapter {
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  listDirectory(path: string): Promise<string[]>;
  deleteFile(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  readJson<T>(path: string): Promise<T>;
  writeJson<T>(path: string, data: T): Promise<void>;
}
```

### ۵.۱ پیاده‌سازی‌های فاز ۱

- `IndexedDBStorageAdapter` برای اجرای محلی در مرورگر.  
- در صورت پشتیبانی، می‌توان از `FileSystemAccessStorageAdapter` استفاده کرد.

### ۵.۲ بهینه‌سازی‌های لازم

- **Cache**: فایل‌های پایدار مثل پرامپت‌ها و نقش‌ها باید در حافظه کش شوند و با استراتژی LRU مدیریت شوند.
- **Batch Writing**: نوشتن تغییرات پرتکرار (مثل `graph.json` یا `canvas-overview.md`) باید با debounce انجام شود.
- **Async I/O**: عملیات خواندن و نوشتن مستقل باید به‌صورت موازی اجرا شوند و مسیر اصلی را مسدود نکنند.
- **Context Unloading**: داده‌های حجیم نباید مستقیماً وارد پنجره‌ی مدل شوند. ابتدا خلاصه یا ایندکس آن‌ها ساخته می‌شود.

---

## ۶. معماری حافظه (Memory Architecture)

### ۶.۱ پنج لایه‌ی حافظه

| لایه | توضیح | محل ذخیره‌سازی |
|------|-------|----------------|
| **حافظه‌ی کاری** | گفتگوهای جاری و وضعیت لحظه‌ای اجرا | `chats/chat-<node-id>.md` |
| **حافظه‌ی رویدادی** | تصمیم‌ها و پیشرفت کارها | `memory/decisions.md`, `memory/progress.md` |
| **حافظه‌ی معنایی** | دانش پایدار و عمومی | `memory/global.md`, `memory/user.md` |
| **حافظه‌ی رویه‌ای** | مهارت‌ها و قالب‌های ذخیره‌شده | `library/templates/` |
| **حافظه‌ی شخصیتی** | نقش، پرامپت و ابزارهای هر ایجنت | `nodes/node-<id>.md` (بخش `agent`) |

### ۶.۲ MemoryManager

اینجنت‌ها به‌جای استفاده‌ی مستقیم از فایل‌ها، از طریق `MemoryManager` با حافظه کار می‌کنند.

```typescript
interface MemoryManager {
  readMemory(agentId: string, query?: string): Promise<string>;
  writeMemory(agentId: string, content: string, confidence: number): Promise<void>;
  consolidateMemory(agentId: string): Promise<void>;   // فاز ۲
  searchMemory(agentId: string, semanticQuery: string): Promise<string[]>;  // فاز ۲
}
```

**مسیر نوشتن (Write Path):**
1. بررسی دسترسی بر اساس `context_contract.allowed_write_paths`.
2. بررسی قفل بودن نود.
3. اعتبارسنجی اطلاعات.
4. تشخیص تعارض با استفاده از `confidence` و `timestamp`.
5. ذخیره‌سازی نهایی.
6. به‌روزرسانی `last_accessed`.

**مسیر خواندن (Read Path):**
1. دریافت درخواست از ایجنت.
2. بررسی دسترسی بر اساس `context_contract.allowed_read_paths`.
3. خواندن فایل‌های مجاز.
4. فیلتر کردن بر اساس درخواست.
5. به‌روزرسانی `last_accessed`.
6. بازگرداندن نتایج.

### ۶.۳ حل تعارض

- اگر دو ایجنت همزمان بخوان یک فایل حافظه را بنویسند، از مکانیزم `lock` استفاده می‌شود.
- اگر اطلاعات جدید با `confidence` بالاتر وارد شود، جایگزین اطلاعات قبلی می‌شود.
- در صورت تساوی، از کاربر سؤال می‌شود.

### ۶.۴ آینده‌نگری

- **فراموشی هوشمند:** با استفاده از `last_accessed` و یک بازه‌ی زمانی مشخص، اطلاعات کهنه به بایگانی منتقل می‌شوند.
- **تثبیت حافظه:** وقتی یک ایجنت چند بار یک کار تکراری انجام دهد، سیستم پیشنهاد ساخت قالب می‌دهد.
- **جستجوی معنایی:** با Embedding Vector و ابزارهایی مثل chromadb/lancedb.

---

## ۷. موتور اجرا (Execution Engine)

### ۷.۱ فاز ۱ — Executor سبک

در فاز ۱، یک موتور اجرای ساده به‌صورت State Machine داریم.

```typescript
interface ExecutionState {
  run_id: string;
  canvas_id: string;
  current_node_id: string | null;
  context: Record<string, any>;   // Blackboard موقت
  status: "idle" | "running" | "paused" | "waiting_approval" | "completed" | "failed";
  logs: string[];
}
```

**رفتار:**

- گراف JSON را می‌خواند.
- نود شروع را پیدا کرده و اجرا می‌کند.
- بعد از هر نود، وضعیت جدید را در `context` می‌نویسد.
- اگر یال شرطی باشد، شرط را بررسی می‌کند.
- اگر نود `require_approval` داشته باشد، اجرا را متوقف کرده و منتظر ورودی کاربر می‌ماند.
- بعد از هر مرحله، یک snapshot در `history/` ذخیره می‌کند.
- خطاها در `logs/` ثبت می‌شوند و اجرا متوقف می‌شود.

**محدودیت‌های فاز ۱:**

- اجرای موازی کامل پشتیبانی نمی‌شود؛ فقط ترتیب خطی با شرط‌های ساده.
- حلقه‌های پیچیده و Time Travel پیشرفته نداریم.

### ۷.۲ فاز ۲ — مهاجرت به LangGraph

ساختار فایل‌محور ما کاملاً با LangGraph سازگار است:

| مفهوم Living Canvas | مفهوم LangGraph |
|---------------------|-----------------|
| `graph.json` | تعریف `StateGraph` |
| `nodes/` و `agent` | توابع Node |
| `edges/` و `trigger` | `add_edge` / `add_conditional_edges` |
| `context` و فایل‌های خروجی | `State` |
| `history/` | `Checkpointer` |
| تأیید انسانی | `interrupt` |

**استراتژی مهاجرت:**
1. هر نود Living Canvas به یک تابع `(state) -> dict` تبدیل می‌شود.
2. یال‌های `on_completed` به `add_edge` و یال‌های شرطی به `add_conditional_edges` تبدیل می‌شوند.
3. Checkpointها در `history/` ذخیره می‌شوند.
4. UI فعلی بدون تغییر می‌ماند و فقط لایه‌ی Execution عوض می‌شود.

---

## ۸. ابزارهای هوش مصنوعی در فاز ۱

| ابزار | توضیح | پارامترهای اصلی |
|-------|-------|-----------------|
| `get_canvas_overview` | خواندن `canvas-overview.md` | - |
| `get_node_context` | دریافت جزئیات یک نود | `node_id` |
| `get_agent_brief` | دریافت نقش، پرامپت و قرارداد زمینه | `node_id` |
| `create_node` | ساخت نود جدید | `type`, `title`, `position`, `shape`, `color`, `agent` |
| `update_node` | ویرایش نود موجود | `node_id`, فیلدهای قابل تغییر |
| `delete_node` | حذف نود و یال‌های متصل | `node_id` |
| `create_edge` | اتصال دو نود | `source`, `target`, `type`, `label`, `config` |
| `update_edge` | ویرایش یال | `edge_id`, فیلدها |
| `delete_edge` | حذف یال | `edge_id` |
| `read_memory` | خواندن حافظه‌ی مجاز | `query` (اختیاری) |
| `write_memory` | نوشتن در حافظه‌ی مجاز | `content`, `confidence` |
| `write_output` | نوشتن خروجی در پوشه‌ی مقصد | `node_id` یا مسیر، `content`, `filename` |
| `save_pipeline_template` | ذخیره‌ی کل گراف به‌عنوان قالب | `template_name` |
| `load_pipeline_template` | بارگذاری قالب در بوم جدید | `template_name` |
| `save_role` | ذخیره‌ی نقش جدید | `role_json` |
| `create_output_box` | ساخت جعبه‌ی خروجی مشترک | `title`, `position` |

**محدودیت‌های مهم:**

- `read_memory` و `write_memory` فقط در مسیرهای مجاز `context_contract` کار می‌کنند.
- `write_output` نیز باید مسیر مقصد را بررسی کند و در صورت عدم تطابق خطا بدهد.
- تمام ابزارها بعد از اعمال تغییر، `graph.json` و در صورت نیاز `canvas-overview.md` را به‌روزرسانی می‌کنند.

---

## ۹. قرارداد زمینه (Context Contract)

هر ایجنت هنگام اجرا فقط این فایل‌ها را می‌خواند:

1. `canvas-overview.md` — خلاصه‌ی بوم.
2. فایل نود خودش — برای پرامپت، ابزارها و مأموریت.
3. `memory/agents/<node-id>.md` — حافظه‌ی اختصاصی.
4. خروجی‌های نودهای قبلی که در `allowed_read_paths` مشخص شده‌اند.
5. در صورت مجاز بودن، `memory/decisions.md` و `memory/progress.md`.

**قوانین:**

- ایجنت به هیچ فایلی خارج از `allowed_read_paths` دسترسی ندارد.
- ایجنت فقط در مسیرهای `allowed_write_paths` می‌تواند بنویسد.
- اگر ایجنت نیاز به فایل دیگری داشت، باید درخواست دسترسی کند و کاربر/سیستم تأیید کند.
- پس از هر اجرا، ایجنت باید حافظه‌ی خودش را به‌روزرسانی کند.
- خروجی‌های نهایی فقط در مسیر تعیین‌شده توسط `output_contract.save_to` نوشته می‌شوند.
- قبل از نوشتن خروجی، اعتبارسنجی طبق `validator` انجام می‌شود.

---

## ۱۰. Checkpoint و تاریخچه

### ۱۰.۱ پوشه‌ی `history/`

هر بار که تغییر مهمی در گراف ایجاد می‌شود یا یک مرحله از اجرا تمام می‌شود، یک snapshot از وضعیت گراف و context ذخیره می‌شود:

```
history/
├── snapshot-2026-08-23T15-30-00.json
├── snapshot-2026-08-23T15-35-00.json
└── index.yaml
```

### ۱۰.۲ پیاده‌سازی در فاز ۱

- قبل از هر تغییر عمده، `graph.json` و `context` کپی می‌شوند.
- امکان بازگشت به آخرین snapshot از طریق UI فراهم می‌شود.
- برای جلوگیری از افزایش حجم، فقط Delta (تغییرات) ذخیره می‌شود، نه کل وضعیت.
- هر ۵۰ مرحله یک snapshot کامل گرفته می‌شود.

---

## ۱۱. رویدادها و Event Bus

### ۱۱.۱ رویدادهای اصلی

| رویداد | توضیح |
|--------|-------|
| `node.created` | نود جدید ساخته شد |
| `node.updated` | نود ویرایش شد |
| `node.deleted` | نود حذف شد |
| `edge.created` | یال ساخته شد |
| `edge.updated` | یال ویرایش شد |
| `edge.deleted` | یال حذف شد |
| `node.started` | اجرای یک نود شروع شد |
| `node.completed` | اجرای یک نود با موفقیت تمام شد |
| `node.failed` | اجرای نود شکست خورد |
| `run.paused` | اجرا برای تأیید انسانی متوقف شد |
| `run.resumed` | اجرا ادامه یافت |
| `graph.saved` | گراف ذخیره شد |
| `lock.acquired` | قفل نود گرفته شد |
| `lock.released` | قفل نود آزاد شد |
| `memory.updated` | حافظه به‌روزرسانی شد |

### ۱۱.۲ پیاده‌سازی

- در فاز ۱ از Event Bus سبک در Frontend استفاده می‌شود (Zustand یا mitt).
- در فاز ۲ با WebSocket و Backend جایگزین می‌شود.

---

## ۱۲. مدیریت خطا و سناریوهای شکست

### ۱۲.۱ گیج‌شدن هوش مصنوعی
- **راه‌حل:** Context Contract و `canvas-overview.md`.

### ۱۲.۲ گم‌شدن خروجی‌ها
- **راه‌حل:** پوشه‌ی خروجی مجزا برای هر نود + نسخه‌بندی.

### ۱۲.۳ حلقه‌ی بی‌نهایت
- **راه‌حل:** `max_steps` و تشخیص cycle.

### ۱۲.۴ بیدارشدن زودهنگام
- **راه‌حل:** فقط با رویداد `node.completed` نود بعدی اجرا می‌شود.

### ۱۲.۵ ویرایش وسط اجرا
- **راه‌حل:** قفل نودها در حالت اجرا.

### ۱۲.۶ خطای API
- **راه‌حل:** Fallback بین مدل‌ها و ثبت خطا.

### ۱۲.۷ اجرای کد خطرناک
- **راه‌حل:** Sandbox در فازهای بعد. در فاز ۱ اجرای کد واقعی وجود ندارد.

### ۱۲.۸ فراموشی حافظه
- **راه‌حل:** حافظه‌ی فایل‌محور + به‌روزرسانی اجباری.

### ۱۲.۹ تداخل همزمانی
- **راه‌حل:** مکانیزم `lock`.

### ۱۲.۱۰ خروجی نامعتبر
- **راه‌حل:** اعتبارسنجی با `validator`.

### ۱۲.۱۱ تعارض حافظه
- **راه‌حل:** `confidence` و `timestamp`؛ در صورت تساوی، سؤال از کاربر.

---

## ۱۳. نسخه‌بندی قالب‌ها و نقش‌ها

- هر قالب و نقش دارای فیلد `version` است.
- تغییرات بزرگ باعث افزایش نسخه می‌شود.
- بوم‌هایی که از قالب استفاده کرده‌اند، `template_version` را در `canvas.yaml` دارند.
- ارتقا به نسخه‌ی جدید قالب دستی و با تأیید کاربر است.
- در فاز ۱ مهاجرت خودکار پیاده‌سازی نمی‌شود.

---

## ۱۴. فازهای پیاده‌سازی

### فاز ۱.۱: ساختار فایل و ذخیره‌سازی
- پیاده‌سازی `StorageAdapter` با IndexedDB.
- ساخت پوشه‌های پروژه مطابق ساختار.
- پیاده‌سازی `manifest.json` و `canvas.yaml`.
- تعریف Graph JSON Schema.

### فاز ۱.۲: بوم بصری
- React + React Flow + Zustand.
- ساخت نود و یال با Drag & Drop.
- پنل تنظیمات نود.
- نمایش viewMode های `dot`, `name`, `card`, `markdown`.
- انیمیشن‌های ساده CSS.
- پیاده‌سازی قفل‌گذاری نود.

### فاز ۱.۳: یکپارچه‌سازی هوش مصنوعی و MemoryManager
- پیاده‌سازی MemoryManager.
- اتصال به مدل‌های رایگان (DeepSeek, GLM).
- چت با نودهای Agent.
- ذخیره‌ی چت‌ها در `chats/`.
- اعمال محدودیت‌های Context Contract.
- ثبت لاگ‌ها در `logs/`.

### فاز ۱.۴: حافظه‌ی مرکزی و Checkpoint
- ساخت `memory/` و به‌روزرسانی خودکار.
- snapshotگیری در `history/`.
- قابلیت بازگشت به snapshot قبلی.

### فاز ۱.۵: خروجی‌ها و قالب‌ها
- ذخیره‌ی خروجی‌ها با `index.yaml`.
- اعتبارسنجی خروجی.
- ساخت Output Box.
- ذخیره و بارگذاری قالب.

---

## ۱۵. الزامات فنی برای MVP

- **Frontend:** React + Vite + TypeScript + React Flow + Zustand + Tailwind CSS.
- **State Management:** Zustand + Event Bus سبک.
- **Storage:** IndexedDB در فاز ۱، File System Access API در صورت امکان.
- **AI Providers:** DeepSeek، GLM-4-Flash، آینده Ollama.
- **Validation:** JSON Schema یا بررسی دستی ساده.
- **Logging:** فایل‌های `.log` ساده.
- **Execution:** Executor سبک داخلی (فاز ۱) و LangGraph (فاز ۲).

---

## ۱۶. موارد معوق (Backlog)

1. ارتباط مستقیم (Direct Message) بین Agentها.
2. مهاجرت خودکار قالب‌ها.
3. سیستم کامل Undo/Redo.
4. Schema Registry با Zod.
5. همگام‌سازی چند Tab با BroadcastChannel یا WebSocket.
6. اجرای کد واقعی با Sandbox.
7. Backend مستقل و WebSocket.
8. جستجوی معنایی با Embedding Vector.
9. فراموشی هوشمند با `last_accessed`.
10. تثبیت خودکار حافظه.
11. پشتیبانی از MCP.
12. احراز هویت و چندکاربره.
13. اجرای موازی کامل عامل‌ها.
14. مشاهده‌پذیری پیشرفته با LangSmith یا معادل.

---

## ۱۷. جمع‌بندی

این سند معماری فاز ۱ را به‌طور کامل مشخص می‌کند.  
پیاده‌سازی باید دقیقاً مطابق این ساختار انجام شود.  
هر تغییری در معماری باید ابتدا در همین سند اعمال و نسخه‌ی جدید ثبت شود.

**قدم بعدی:**  
پس از تأیید نهایی این سند، توسعه‌دهنده می‌تواند پیاده‌سازی فاز ۱.۱ را آغاز کند.

---

ا

---

# الحاقیهٔ نسخهٔ ۱.۴ — هم‌راستاسازی سند با کد (فاز ۱.۲/۱.۳)

> **تاریخ:** 2026-09-01
> **وضعیت:** تأییدشده — این بخش در صورت تناقض، بر نسخهٔ ۱.۳ مقدم است.
> **چرا:** سه سند موجود با کد فاصله داشتند (فایل‌ها فقط نوشته می‌شدند، قرارداد خواندن اعمال نمی‌شد، اعتبارسنجی تشریفاتی بود). این الحاقیه آنچه *واقعاً* پیاده شده را مستند می‌کند و سه باگ بحرانی را به‌عنوان قرارداد ثبت می‌کند.

## الف) فایل `state.json` (رسمی شد)

§۲ آن را نداشت، ولی عملاً ستون بازگردانی سریع وضعیت است:

```json
{
  "canvas": { "…": "متادیتای canvas.yaml" },
  "memory": { "global": {}, "decisions": {}, "progress": {}, "user": {}, "agents": {} },
  "outputs": {}, "chats": {}, "logs": {}, "snapshots": [],
  "saved_at": "ISO-8601"
}
```

- **قاعده:** `state.json` کشِ کارایی است، نه منبع حقیقت. هر چیزی که در `state.json` هست باید بتواند از فایل‌های §۲ بازسازی شود؛ اگر نتوانست، آن قابلیت ناقص است.
- `graph.json` هم برخلاف §۴، `data` کامل نود را نگه می‌دارد (تا UI بدون پارس YAML بالا بیاید). فایل Markdown هر نود همچنان نسخهٔ خوانا/قابل‌ویرایش است.

## ب) دو مسیر معتبر بارگذاری (`hydrate`)

| شرایط | رفتار |
|---|---|
| `manifest.json` نیست | بارگذاری رد می‌شود → seed (و هیچ فایل موجودی پاک نمی‌شود) |
| `graph.json` + `state.json` هست | بارگذاری سریع؛ سپس `title`/`content`/`agent.system_prompt` **از فایل Markdown هر نود اورلی می‌شود** تا ویرایش بیرونی (Obsidian/Git) گم نشود |
| فقط فایل‌های `nodes/*.md` + `edges/*.yaml` + `memory/*.md` | بوم از همان فایل‌ها ساخته می‌شود (حالت «فایل‌محور خالص») |

- **قفل هرگز از فایل بازگردانی نمی‌شود** و همیشه `free` است؛ وضعیت ایجنتِ نیمه‌کاره به `idle` برمی‌گردد (§12.5).
- فایل‌های ناخوانا **حذف** می‌شوند و در Event Bus گزارش می‌شوند؛ بقیهٔ بوم زنده می‌ماند.

## پ) قرارداد `StorageAdapter.listDirectory`

برای اینکه بازگردانی قالب‌ها و نقاشی‌ها کار کند، این قرارداد لازم‌الاجراست:

- بچه‌های **مستقیم** پوشه برگردانده می‌شود، نه کل زیردرخت.
- فایل‌ها: `نام-فایل.پسوند`. زیرپوشه‌ها: `نام-پوشه/` (با اسلش انتهایی).
- مرتب و بدون تکرار. پوشهٔ خالی → `[]` (نه خطا).
- **ممنوع:** حذف آیتم‌هایی که `/` دارند — همان اشتباهی که باعث شد `library/templates/<id>/template.json` هرگز دیده نشود و قالب‌های کاربر بعد از رفرش ناپدید شوند.

## ت) Export / Import (قابلیت جابه‌جایی داده)

دو مسیر، هر دو **فایل‌محور**:

1. **باندل JSON** — `{"<canvas-id>.livingcanvas.json"}`:
   ```json
   { "kind": "living-canvas-export", "version": 1, "canvas_id": "…", "files": { "canvases/<id>/nodes/node-001.md": "…" } }
   ```
   `files` دقیقاً درخت §۲ است (کلید = مسیر کامل منطقی). سقف ۳۲MB.
2. **پوشه** — نوشتن/خواندن همان درخت روی فایل‌سیستم.

اعتبارسنجی الزامی در Import:
- رد هر مسیر مطلق، `..`، بک‌اسلش و نام نامعتبر (و گزارش «چرا رد شد» به کاربر).
- رد محتوای غیررشته‌ای (فایل باینری فعلاً پشتیبانی نمی‌شود).
- رد `version` بزرگ‌تر از نسخهٔ برنامه (تا داده خراب نشود).
- فایل متعلق به `canvas_id` دیگر → رد.
- نبودِ `manifest.json` = هشدار، نه رد (پوشه‌ای که دستی ساخته شده قابل‌استفاده بماند).

**Import هیچ‌وقت بی‌پیش‌نمایش اعمال نمی‌شود:** ابتدا تعداد نود/یال/فایل و هشدارها نشان داده می‌شود، بعد تأیید کاربر.

## ث) «حالت پوشهٔ زنده» (فاز ۱.۵ پیش‌افتاده)

`FileSystemAccessStorageAdapter` همان رابط §۵ را روی یک `FileSystemDirectoryHandle` پیاده می‌کند:

- پوشه‌ای که کاربر انتخاب می‌کند **عیناً** ریشهٔ بوم است: پیشوند `canvases/<id>/` از مسیر منطقی کم می‌شود، پس روی دیسک `nodes/node-001.md` می‌بینید — سازگار با Git و Obsidian.
- هندل پوشه در IndexedDB نگه داشته می‌شود و هنگام boot مجدداً وصل می‌شود (با درخواست اجازه).
- نوشتن‌ها **sync-with-store** هستند (بدون debounce) تا بیرون از برنامه همیشه آخرین وضعیت دیده شود؛ به‌علاوهٔ دکمهٔ «بازخوانی از دیسک» برای وقتی که بیرون فایل را عوض کرده‌اید.
- اگر File System Access پشتیبانی نشود (Firefox/Safari)، همان داده با باندل JSON جابه‌جا می‌شود.

## ج) قاعدهٔ امنیتی رندر متن (پیش از وصل‌شدن AI)

هر متنی که می‌تواند خروجی مدل باشد **باید** پیش از رندر escape شود؛ قالب‌بندی inline **پس از** escape اعمال می‌شود:

- تابع مشترک `escapeHtml` + `mdInline` در `src/lib/core.ts`؛ رندر Markdown نودها فقط از همین مسیر عبور می‌کند.
- تنها تگ‌های مجاز پس از قالب‌بندی: `strong`، `em`، `code`.
- هیچ‌گاه `dangerouslySetInnerHTML` روی رشتهٔ خام (کاربری یا مدل) استفاده نکنید.

## چ) تغییرات سازگار‌کننده در قالب فایل‌ها

- `nodes/node-<id>.md` حالا `position` را هم در Frontmatter دارد (قبلاً فقط در `graph.json` بود و فایل به‌تنهایی قابل‌بازگردانی نبود).
- `agent.system_prompt` **کامل** نوشته می‌شود (برش ۱۲۰ کاراکتری حذف شد؛ همان برش باعث می‌شد هویت ایجنت در حالت فایل‌محور از بین برود).
- رشته‌های چندخطی در YAML به‌صورت double-quoted با escape نوشته/خوانده می‌شوند تا فایل‌ها با YAML‌خوان‌های واقعی هم بخوانده شوند.
- `toYaml` و `parseYaml` اکنون یک دور‌رفتی تضمین‌شده دارند (تست: `parseYaml(toYaml(x)) === x`).

## ط) تست‌ها و دستورهای اجرا

`npm test` (یا `npx vitest run`) — ۶۱ تست در ۵ فایل، بدون jsdom و بدون فایل کانفیگ (vitest از همان `vite.config.js` استفاده می‌کند):

| فایل | تعداد | چه چیزی را می‌بندد |
|---|---|---|
| `src/lib/__tests__/storage.test.ts` | 16 | قرارداد `listDirectory` (فایل بدون `/`، پوشه با `/`)، `safeRelPath`، CRUD آداپترها، LRU و fallback حالت خصوصی |
| `src/lib/__tests__/portable.test.ts` | 20 | دور‌رفتی باندل، ردّ `..`، نسخه‌ی جدیدتر، بوم بیگانه، `escapeHtml`/`mdInline` (XSS) |
| `src/lib/__tests__/fs-access.test.ts` | 13 | آداپتر FS Access، نگاشت پبکس، `ensureStructure`، `walkDir` (فقط فایل)، مقاومت `writeFilesToDirectory` |
| `src/lib/__tests__/roundtrip.test.ts` | 4 | بوم seed → Export → Import → مقایسه‌ی بایت‌به‌بایت فایل‌ها + هیدرِیت از فایل‌های واقعی |
| `src/lib/__tests__/hydrate.test.ts` | 8 | `hydrate()` واقعی: اورلی فایل بر `graph.json` مقدم است، `state.json` قفل اجرا را برنمی‌گرداند، بوم بدون `graph.json`، الگوی سفارشی از پوشه |

`npm run typecheck` با `noUnusedLocals` اجرا می‌شود — کد مرده در `src/` نمی‌ماند.

**قاعده‌ی تست:** هیچ تستی سریالایزر/پارسر را از نو پیاده نمی‌کند؛ همه از `src/lib/test-helpers.ts` عبور می‌کنند که مستقیماً `toYaml`/`nodeToMarkdown`/`parseYaml`ِ پروداکشن را صدا می‌زند (تستِ فیکسچر دست‌نویس، همان اشتباه باگ را در خودش تکرار می‌کرد).

**بدهی آگاهانه‌ی باقی‌مانده (خارج از این فاز):** `executeNode` برای ورودی، `allowed_read_paths` را نادیده می‌گیرد؛ `askModel` آدرس DeepSeek و `max_tokens` ثابت دارد و `agent.tools` را فیلتر نمی‌کند؛ `validateOutput` عملاً شکست‌ناپذیر است و `schemas/*.schema.json` هیچ‌جا خوانده نمی‌شود؛ `apiKey` در `localStorage` است.
