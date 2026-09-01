/* ============================================================
   Living Canvas — File System Access StorageAdapter (doc §5.1)
   A real workspace on disk: the folder the user picks becomes the §2 tree
   verbatim, so the files stay readable by Git and Obsidian.
   ============================================================ */
import { safeRelPath, listChildren, type StorageAdapter } from "./core";

/** DOM FileSystemDirectoryHandle — the native TS type is readonly, so we keep our own structural wrapper. */
export interface FsDirHandle {
  name: string;
  kind: "directory";
  getDirectoryHandle(name: string, opts?: { create?: boolean }): Promise<FsDirHandle>;
  getFileHandle(name: string, opts?: { create?: boolean }): Promise<FsFileHandle>;
  removeEntry(name: string, opts?: { recursive?: boolean }): Promise<void>;
  entries(): AsyncIterableIterator<[string, FsDirHandle | FsFileHandle]>;
  values(): AsyncIterableIterator<FsDirHandle | FsFileHandle>;
  requestPermission?(opts: { mode: "read" | "readwrite" }): Promise<PermissionState>;
  queryPermission?(opts: { mode: "read" | "readwrite" }): Promise<PermissionState>;
}
export interface FsFileHandle {
  name: string;
  kind: "file";
  getFile(): Promise<File>;
  createWritable(): Promise<{ write(data: string | Blob | BufferSource): Promise<void>; close(): Promise<void> }>;
}

type PickerWindow = Window & {
  showDirectoryPicker?: (opts?: { id?: string; mode?: "read" | "readwrite"; startIn?: unknown }) => Promise<FsDirHandle>;
};

/** Does this browser have the File System Access API? (Chromium yes, Firefox/Safari not yet) */
export function isFsAccessSupported(): boolean {
  return typeof window !== "undefined" && typeof (window as PickerWindow).showDirectoryPicker === "function";
}

/** Pick a folder with write permission. Throws AbortError when the user cancels. */
export async function pickCanvasDirectory(id = "living-canvas-workspace"): Promise<FsDirHandle> {
  const w = window as PickerWindow;
  if (typeof w.showDirectoryPicker !== "function") {
    throw new Error("This browser does not support the File System Access API");
  }
  const dir = await w.showDirectoryPicker({ id, mode: "readwrite" });
  const granted = await ensurePermission(dir, "readwrite");
  if (!granted) throw new Error("Write permission for the folder was not granted");
  return dir;
}

export async function ensurePermission(dir: FsDirHandle, mode: "read" | "readwrite" = "readwrite"): Promise<boolean> {
  try {
    const opts = { mode };
    if (typeof dir.queryPermission === "function" && (await dir.queryPermission(opts)) === "granted") return true;
    if (typeof dir.requestPermission === "function") return (await dir.requestPermission(opts)) === "granted";
    return true; // browsers with a native API usually have the handle granted already
  } catch {
    return false;
  }
}

/** Reads the folder handle (to show its name in the TopBar). */
export const dirName = (dir: FsDirHandle | null): string | null => dir?.name ?? null;

/**
 * Maps a logical canvas path (e.g. `canvases/nexus-edu-001/nodes/node-001.md`) to a path
 * relative to the picked folder: `nodes/node-001.md`.
 * Rejects anything outside the root, `..`, and invalid names.
 */
export function toRelativePath(logicalPath: string, rootPrefix: string): string | null {
  const clean = safeRelPath(logicalPath);
  if (!clean) return null;
  const prefix = rootPrefix.replace(/^\/+|\/+$/g, "");
  if (prefix) {
    if (clean === prefix || !clean.startsWith(prefix + "/")) return null;
    const rel = clean.slice(prefix.length + 1);
    return rel ? safeRelPath(rel) : null;
  }
  return clean;
}

/** Walks/creates the intermediate folders and returns the file handle. */
async function resolveFile(dir: FsDirHandle, rel: string, create: boolean): Promise<FsFileHandle | null> {
  const parts = rel.split("/");
  const name = parts.pop()!;
  let cur = dir;
  for (const p of parts) {
    if (!p) continue;
    cur = await cur.getDirectoryHandle(p, { create });
  }
  try {
    return await cur.getFileHandle(name, { create });
  } catch {
    return null;
  }
}

async function resolveDir(dir: FsDirHandle, rel: string, create: boolean): Promise<FsDirHandle | null> {
  const parts = rel.split("/").filter(Boolean);
  let cur = dir;
  for (const p of parts) {
    try {
      cur = await cur.getDirectoryHandle(p, { create });
    } catch {
      return null;
    }
  }
  return cur;
}

/**
 * Recursive walk — returns files only (folders are plumbing, not data).
 * maxDepth guards against both symlink cycles and depth blow-ups.
 */
export async function walkDir(dir: FsDirHandle, prefix = "", maxDepth = 8): Promise<Record<string, FsFileHandle>> {
  const out: Record<string, FsFileHandle> = {};
  if (maxDepth < 0) return out;
  for await (const [name, handle] of dir.entries()) {
    const path = prefix ? `${prefix}/${name}` : name;
    if (handle.kind === "directory") Object.assign(out, await walkDir(handle as FsDirHandle, path, maxDepth - 1));
    else out[path] = handle as FsFileHandle;
  }
  return out;
}

/**
 * StorageAdapter over a FileSystemDirectoryHandle.
 * `rootPrefix` is the logical root, so files land without a nested folder (§2).
 */
export class FsAccessStorageAdapter implements StorageAdapter {
  private cache = new Map<string, string>();

  /** adapter kind label — lets core.storageMode() detect it without a circular import */
  readonly adapterKind = "fs" as const;

  constructor(
    private dir: FsDirHandle,
    private rootPrefix: string
  ) {}

  get rootName(): string {
    return this.dir.name;
  }

  private rel(path: string): string {
    const r = toRelativePath(path, this.rootPrefix);
    if (!r) throw new Error(`path outside the canvas folder: ${path}`);
    return r;
  }

  async readFile(path: string): Promise<string> {
    const rel = this.rel(path);
    const hit = this.cache.get(rel);
    if (hit !== undefined) return hit;
    const fh = await resolveFile(this.dir, rel, false);
    if (!fh) throw new Error(`ENOENT: ${path}`);
    const text = await (await fh.getFile()).text();
    this.cache.set(rel, text);
    return text;
  }

  async writeFile(path: string, content: string): Promise<void> {
    const rel = this.rel(path);
    const fh = await resolveFile(this.dir, rel, true);
    if (!fh) throw new Error(`write failed: ${path}`);
    const w = await fh.createWritable();
    await w.write(content);
    await w.close();
    this.cache.set(rel, content);
  }

  async deleteFile(path: string): Promise<void> {
    let rel: string;
    try {
      rel = this.rel(path);
    } catch {
      return;
    }
    this.cache.delete(rel);
    const parts = rel.split("/");
    const name = parts.pop()!;
    const parent = await resolveDir(this.dir, parts.join("/"), false);
    if (!parent) return;
    try {
      await parent.removeEntry(name);
    } catch {
      /* missing file — skipped silently, like the IndexedDB adapter */
    }
  }

  async exists(path: string): Promise<boolean> {
    try {
      const rel = this.rel(path);
      if (this.cache.has(rel)) return true;
      return (await resolveFile(this.dir, rel, false)) !== null;
    } catch {
      return false;
    }
  }

  async readJson<T>(path: string): Promise<T> {
    return JSON.parse(await this.readFile(path)) as T;
  }

  async writeJson<T>(path: string, data: T): Promise<void> {
    await this.writeFile(path, JSON.stringify(data, null, 2));
  }

  /** direct children: files bare, subfolders with a trailing "/" (§listDirectory contract) */
  async listDirectory(dir: string): Promise<string[]> {
    let rel = "";
    if (dir && dir !== "." && dir !== "") {
      const r = toRelativePath(dir, this.rootPrefix);
      if (r === null) return [];
      rel = r;
    }
    const target = rel ? await resolveDir(this.dir, rel, false) : this.dir;
    if (!target) return [];
    const out = new Set<string>();
    for await (const [name, handle] of target.entries()) {
      if (handle.kind === "directory") out.add(name + "/");
      else out.add(name);
    }
    return [...out].sort();
  }

  /** full list of logical paths (backs allPaths/hydrate and Export). */
  async allPaths(): Promise<string[]> {
    const flat = await walkDir(this.dir);
    const prefix = this.rootPrefix.replace(/^\/+|\/+$/g, "");
    const paths = Object.keys(flat)
      .filter((p) => !p.startsWith(".")) // dotfiles are not canvas files
      .map((p) => (prefix ? `${prefix}/${p}` : p));
    return [...new Set(paths)].sort();
  }

  /** empties the canvas folder only — never the whole disk. */
  async clear(): Promise<void> {
    this.cache.clear();
    for (const p of await this.allPaths()) await this.deleteFile(p);
  }
}

/**
 * Read-only filesystem view: used to import from a folder the user opened *read-only* —
 * input comes from walkDir and nothing is ever written.
 */
export async function readCanvasFromDirectory(dir: FsDirHandle, rootPrefix = ""): Promise<Record<string, string>> {
  const flat = await walkDir(dir);
  const out: Record<string, string> = {};
  for (const [rel, handle] of Object.entries(flat)) {
    if (rel.startsWith(".")) continue;
    try {
      const f = await (handle as FsFileHandle).getFile();
      // files above 2MB (probably binary assets) never enter the state; their path is still reported
      if (f.size > 2 * 1024 * 1024) continue;
      out[rootPrefix ? `${rootPrefix}/${rel}` : rel] = await f.text();
    } catch {
      /* unreadable (locked / too large) — skipped */
    }
  }
  return out;
}

/** Writes a set of logical files into a folder and returns stats. */
export async function writeFilesToDirectory(
  dir: FsDirHandle,
  files: Record<string, string>,
  rootPrefix = "",
  onProgress?: (done: number, total: number, path: string) => void
): Promise<{ written: number; failed: string[] }> {
  const entries = Object.entries(files);
  const prefix = rootPrefix.replace(/^\/+|\/+$/g, "");
  let written = 0;
  const failed: string[] = [];
  let n = 0;
  for (const [logicalPath, content] of entries) {
    n++;
    const stripped = prefix && logicalPath.startsWith(prefix + "/") ? logicalPath.slice(prefix.length + 1) : logicalPath;
    // re-validate AFTER stripping the prefix, otherwise `canvases/x/../evil.md`
    // escapes the prefix trap and lands outside the folder.
    const rel = safeRelPath(stripped);
    if (!rel) {
      failed.push(logicalPath);
      continue;
    }
    try {
      const parts = rel.split("/");
      const name = parts.pop()!;
      const parent = await resolveDir(dir, parts.join("/"), true);
      if (!parent) throw new Error("no parent dir");
      const fh = await parent.getFileHandle(name, { create: true });
      const w = await fh.createWritable();
      await w.write(content);
      await w.close();
      written++;
    } catch {
      failed.push(logicalPath);
    }
    onProgress?.(n, entries.length, rel);
  }
  return { written, failed };
}

/**
 * Creates the §2 skeleton inside a folder (empty one or a fresh Git clone).
 * Harmless by design: existing folders change nothing.
 *
 * `runs/` is the append-only run ledger (one file per run); a hand-made vault gets it too so the
 * tree the app writes and the tree the user sees stay the same shape.
 */
export const CANVAS_SUBDIRS = [
  "nodes", "edges", "strokes", "chats", "outputs", "memory/agents",
  "history", "logs", "runs", "library/shapes", "library/roles", "library/templates", "assets",
];

export async function ensureStructure(dir: FsDirHandle, relRoot = ""): Promise<string[]> {
  const made: string[] = [];
  const create = async (parts: string[], parent: FsDirHandle) => {
    const [head, ...rest] = parts;
    if (!head) return;
    let child: FsDirHandle;
    try {
      child = await parent.getDirectoryHandle(head, { create: true });
    } catch {
      return;
    }
    made.push(head);
    if (rest.length) await create(rest, child);
  };
  for (const sub of CANVAS_SUBDIRS) await create(sub.split("/"), dir);
  void relRoot;
  return made;
}

/** Raw directory children — used by tests and by the File Tree in folder mode. */
export async function immediateChildren(dir: FsDirHandle, rel = ""): Promise<string[]> {
  const target = rel ? await resolveDir(dir, rel, false) : dir;
  if (!target) return [];
  const names: string[] = [];
  for await (const [name, handle] of target.entries()) names.push(handle.kind === "directory" ? `${name}/` : name);
  return names.sort();
}

/** Helper that matches the core.listDirectory contract (used by tests). */
export const childrenFromPaths = (paths: Iterable<string>, dir: string) => listChildren(paths, dir);
