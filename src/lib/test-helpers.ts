/* ============================================================
   test-helpers — فقط برای تست. انطباق API ساده با سریال‌سازهای واقعی core.ts
   تا تست‌ها خودشان serialiser دست‌ساز نداشته باشند (وگرنه باگ را می‌پوشانند).
   ============================================================ */
import {
  nodeToMarkdown as coreNodeToMarkdown,
  memoryToMd as coreMemoryToMd,
  frontmatter,
  toYaml,
  parseYaml,
  edgeToYaml,
  escapeHtml,
  mdInline,
  listChildren,
  safeRelPath,
  type LCNodeData,
  type MemDoc,
} from "./core";
import { makeNodeData } from "../state";

export { frontmatter, toYaml, parseYaml, edgeToYaml, escapeHtml, mdInline, listChildren, safeRelPath, coreNodeToMarkdown };

type NodeShim = {
  title?: string;
  nodeType?: LCNodeData["nodeType"];
  position?: { x: number; y: number };
  color?: string;
  shape?: LCNodeData["shape"];
  viewMode?: LCNodeData["viewMode"];
  content?: string;
  agent?: Partial<NonNullable<LCNodeData["agent"]>> | null;
};

/** فایل Markdown یک نود را با همان تابع تولیدِ واقعی می‌سازد. */
export function nodeToMarkdown(id: string, shim: NodeShim = {}): string {
  const base = makeNodeData(shim.nodeType ?? "note", shim.title ?? id, "test");
  const data: LCNodeData = {
    ...base,
    ...(shim.color ? { color: shim.color } : {}),
    ...(shim.shape ? { shape: shim.shape } : {}),
    ...(shim.viewMode ? { viewMode: shim.viewMode } : {}),
    ...(shim.content !== undefined ? { content: shim.content } : {}),
    agent: shim.agent === null ? null : { ...(base.agent ?? ({} as never)), ...(shim.agent ?? {}) },
  };
  if (shim.nodeType && shim.nodeType !== "agent") data.agent = null;
  return coreNodeToMarkdown(id, data, shim.position ?? null);
}

/** سند حافظه با مقادیر پیش‌فرض. */
export function memoryToMd(doc: Partial<MemDoc> & { body: string }): string {
  const full: MemDoc = {
    path: doc.path ?? "memory/global.md",
    title: doc.title ?? "حافظه",
    body: doc.body,
    updated_at: doc.updated_at ?? "2026-09-01T10:00:00.000Z",
    last_accessed: doc.last_accessed ?? "2026-09-01T10:00:00.000Z",
    confidence: doc.confidence ?? 0.8,
    source: doc.source ?? "system",
  };
  return coreMemoryToMd(full);
}
