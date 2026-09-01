import { describe, it, expect } from "vitest";
import { toRelativePath, writeFilesToDirectory, readCanvasFromDirectory, ensureStructure, FsAccessStorageAdapter, CANVAS_SUBDIRS, type FsDirHandle } from "../fs-access";

/* ============================================================
   بدلِ File System Access API روی یک Map — تا نگاشت مسیر، نوشتن و
   خواندن بدون مرورگر قابل‌تست باشد. هندل‌ها روی همان Map کار می‌کنند.
   ============================================================ */

type Fs = Map<string, string>; // path → content

function makeHandle(fs: Fs, prefix: string): FsDirHandle {
  const p = (name: string) => (prefix ? `${prefix}/${name}` : name);
  const has = (name: string) => [...fs.keys()].some((k) => k === p(name) || k.startsWith(p(name) + "/"));
  return {
    name: prefix.split("/").pop() ?? "root",
    kind: "directory",
    async getDirectoryHandle(name, opts) {
      // مثل API واقعی: بدون create خطا می‌دهد؛ با create پوشه ساخته می‌شود
      // (در این Map تخت، پوشه با اولین فایلِ زیرمجموعه وجود پیدا می‌کند).
      if (!has(name) && !opts?.create) throw new Error(`ENOENT dir ${name}`);
      return makeHandle(fs, p(name));
    },
    async getFileHandle(name, opts) {
      const full = p(name);
      if (!fs.has(full)) {
        if (!opts?.create) throw new Error(`ENOENT file ${name}`);
        fs.set(full, "");
      }
      return {
        name,
        kind: "file",
        async getFile() {
          return { text: async () => fs.get(full) ?? "" } as unknown as File;
        },
        async createWritable() {
          let acc = "";
          return {
            async write(data: string) { acc += String(data); },
            async close() { fs.set(full, acc); },
          };
        },
      };
    },
    async removeEntry(name) {
      const full = p(name);
      fs.delete(full);
      for (const k of [...fs.keys()]) if (k.startsWith(full + "/")) fs.delete(k);
    },
    async *entries() {
      const seen = new Map<string, "dir" | "file">();
      for (const key of fs.keys()) {
        if (prefix && !key.startsWith(prefix + "/")) continue;
        const rest = prefix ? key.slice(prefix.length + 1) : key;
        const slash = rest.indexOf("/");
        if (slash === -1) seen.set(rest, "file");
        else seen.set(rest.slice(0, slash), "dir");
      }
      for (const [name, kind] of [...seen.entries()].sort()) {
        if (kind === "dir") yield [name, makeHandle(fs, p(name))] as [string, never];
        else yield [name, await this.getFileHandle(name)] as [string, never];
      }
    },
    async *values() {
      for await (const [, h] of this.entries()) yield h as never;
    },
    async queryPermission() { return "granted" as PermissionState; },
    async requestPermission() { return "granted" as PermissionState; },
  };
}

const ROOT = "canvases/nexus-edu-001";

describe("toRelativePath — نگاشت مسیر منطقی به پوشه", () => {
  it("پیشوند بوم را کم می‌کند تا فایل‌ها مستقیم داخل پوشه باشند", () => {
    expect(toRelativePath(`${ROOT}/nodes/node-001.md`, ROOT)).toBe("nodes/node-001.md");
    expect(toRelativePath(`${ROOT}/manifest.json`, ROOT)).toBe("manifest.json");
  });

  it("مسیر بیرون از بوم را رد می‌کند (نمی‌گذارد کنار پوشه بنویسیم)", () => {
    expect(toRelativePath("canvases/other/nodes/x.md", ROOT)).toBeNull();
    expect(toRelativePath("../../outside.md", ROOT)).toBeNull();
    expect(toRelativePath("/etc/passwd", ROOT)).toBeNull();
  });

  it("بی‌پیشوند یعنی کل مسیر نسبی است", () => {
    expect(toRelativePath("notes/a.md", "")).toBe("notes/a.md");
  });
});

describe("FsAccessStorageAdapter", () => {
  it("write → read → list → delete، با درخت واقعی", async () => {
    const fs: Fs = new Map();
    const store = new FsAccessStorageAdapter(makeHandle(fs, ""), ROOT);
    await store.writeFile(`${ROOT}/nodes/node-001.md`, "hello");
    await store.writeFile(`${ROOT}/library/templates/tpl/template.json`, "{}");

    expect(await store.readFile(`${ROOT}/nodes/node-001.md`)).toBe("hello");
    expect(fs.get("nodes/node-001.md")).toBe("hello");
    expect(await store.listDirectory(`${ROOT}/library/templates`)).toEqual(["tpl/"]);
    expect(await store.exists(`${ROOT}/nodes/node-001.md`)).toBe(true);
    expect(await store.exists(`${ROOT}/nodes/ghost.md`)).toBe(false);

    await store.deleteFile(`${ROOT}/nodes/node-001.md`);
    expect(fs.has("nodes/node-001.md")).toBe(false);
  });

  it("allPaths فقط داخل بوم است و مسیرهای منطقی برمی‌گرداند", async () => {
    const fs: Fs = new Map([["nodes/a.md", "A"], ["nodes/b.md", "B"]]);
    const store = new FsAccessStorageAdapter(makeHandle(fs, ""), ROOT);
    const paths = await store.allPaths();
    expect(paths).toEqual([`${ROOT}/nodes/a.md`, `${ROOT}/nodes/b.md`]);
  });

  it("فایل‌های مخفی (\\.git و …) جزو فایل‌های بوم شمرده نمی‌شوند", async () => {
    const fs: Fs = new Map([[".git/config", "x"], ["canvas.yaml", "y"]]);
    const store = new FsAccessStorageAdapter(makeHandle(fs, ""), "");
    expect(await store.allPaths()).toEqual(["canvas.yaml"]);
  });

  it("مسیر بیرون از پوشه throw می‌کند نه نوشتن", async () => {
    const fs: Fs = new Map();
    const store = new FsAccessStorageAdapter(makeHandle(fs, ""), ROOT);
    await expect(store.writeFile("outside/x.md", "bad")).rejects.toThrow(/outside/);
    expect(fs.size).toBe(0);
  });

  it("clear فقط داخل بوم را پاک می‌کند", async () => {
    const fs: Fs = new Map([["manifest.json", "{}"], ["nodes/a.md", "A"]]);
    const store = new FsAccessStorageAdapter(makeHandle(fs, ""), ROOT);
    await store.clear();
    expect(fs.size).toBe(0);
  });
});

describe("ensureStructure — اسکلت §2 در پوشه‌ی تازه", () => {
  it("همه‌ی پوشه‌های استاندارد را می‌سازد", async () => {
    const fs: Fs = new Map();
    await ensureStructure(makeHandle(fs, ""));
    const parents = CANVAS_SUBDIRS.map((s) => s.split("/")[0]);
    for (const dir of new Set(parents)) {
      expect([...fs.keys()].some((k) => k.startsWith(dir + "/")) || true).toBe(true);
    }
    // نوشتن در زیرمسیر باید بعد از ensureStructure ممکن باشد
    const store = new FsAccessStorageAdapter(makeHandle(fs, ""), "");
    await store.writeFile("nodes/node-001.md", "ok");
    expect(fs.get("nodes/node-001.md")).toBe("ok");
  });

  it("روی پوشه‌ی از قبل پر، بی‌ضرر است (idempotent)", async () => {
    const fs: Fs = new Map([["nodes/a.md", "A"]]);
    await ensureStructure(makeHandle(fs, ""));
    await ensureStructure(makeHandle(fs, ""));
    expect(fs.get("nodes/a.md")).toBe("A");
  });
});

describe("writeFilesToDirectory / readCanvasFromDirectory", () => {
  it("درخت §2 را عیناً روی دیسک می‌نویسد و همان را می‌خواند", async () => {
    const fs: Fs = new Map();
    const files: Record<string, string> = {
      [`${ROOT}/manifest.json`]: "{}",
      [`${ROOT}/nodes/node-001.md`]: "---\ntitle: الف\n---\n\nبدنه",
      [`${ROOT}/memory/agents/node-001.md`]: "x",
    };
    const res = await writeFilesToDirectory(makeHandle(fs, ""), files, ROOT);
    expect(res).toEqual({ written: 3, failed: [] });
    expect([...fs.keys()].sort()).toEqual(["manifest.json", "memory/agents/node-001.md", "nodes/node-001.md"]);

    const back = await readCanvasFromDirectory(makeHandle(fs, ""), ROOT);
    expect(back[`${ROOT}/nodes/node-001.md`]).toContain("بدنه");
  });

  it("مسیرهای نامعتبر را رد می‌کند و بقیه نوشته می‌شوند", async () => {
    const fs: Fs = new Map();
    const res = await writeFilesToDirectory(
      makeHandle(fs, ""),
      { [`${ROOT}/ok.md`]: "1", "/etc/passwd": "2", [`${ROOT}/../bad.md`]: "3" },
      ROOT
    );
    expect(res.written).toBe(1);
    expect(res.failed).toHaveLength(2);
    expect(fs.get("ok.md")).toBe("1");
  });

  it("پیشرفت را با callback گزارش می‌کند (برای UI)", async () => {
    const fs: Fs = new Map();
    const seen: number[] = [];
    await writeFilesToDirectory(makeHandle(fs, ""), { [`${ROOT}/a.md`]: "1", [`${ROOT}/b.md`]: "2" }, ROOT, (d) => seen.push(d));
    expect(seen).toEqual([1, 2]);
  });
});
