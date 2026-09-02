#!/usr/bin/env node
/* ============================================================
   Documentation gate — keeps docs/ honest.

   Why this exists: `docs/` is written partly by people (and agents) who cannot read the code, and a reference
   document is only worth having while its references point at something. A convention without a check lasts a
   month, then the corpus quietly splits into "true" and "believed true". So:

     - frontmatter at byte zero, with title / status / updated / sources
     - every file path or symbol named in a doc must resolve in the repository
     - every shipped claim (`- [x]`) must name a guard: a test file, a doc, or a script
     - `status` values are per directory; a superseded decision must name its successor
     - a doc at the root of `docs/` (a spec, an inbox — anything that is neither map nor mechanism) is held to
       the same discipline as a directory: frontmatter, a legal status, a body cap
     - `phase:` is banned everywhere — scheduling is a filename under docs/roadmap/
     - an ADR is short by construction (40 body lines), because a decision that needs 100 lines is a spec

     node scripts/check-docs.mjs          # report; exit 1 on any violation

   Deliberately dumb: no YAML dependency, flat `key: value` frontmatter with inline `[a, b]` lists only.
   If a doc needs richer metadata, that is a signal the doc is becoming a database.
   ============================================================ */
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, posix } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/* ---- rules, written as data so the doc can quote them without drifting ---- */
const EXEMPT = new Set(["docs/ARCHITECTURE.md"]); // the mechanism reference: no frontmatter, owns its own layout
const REQUIRED_KEYS = ["title", "status", "updated", "sources"];
const STATUS = {
  decisions: ["proposed", "accepted", "superseded"],
  patterns: ["draft", "proposed", "open-issue", "parked", "accepted"],
  roadmap: ["draft", "active", "shipped", "parked", "superseded"],
  research: ["draft", "living", "frozen"],
  notes: ["active", "frozen"],
};
const BODY_CAP = { decisions: 40, patterns: 80, roadmap: 60, research: 140, notes: 120 };
/* docs/ root: the map (README) and the mechanism (ARCHITECTURE) are exempt; anything else standing there is a
   spec or a queue, and an un-gated one is exactly how a corpus grows a shadow half. Generous cap, because a
   row-per-decision reference is a table, not an essay — past ~180 lines it is two documents. */
const ROOT_STATUS = ["draft", "active", "proposed", "frozen", "superseded"];
const ROOT_CAP = 180;

/* ---- repository index, so citations are checked against what actually exists ----
   `--others --exclude-standard` on purpose: a gate that only sees committed files cannot be run by the person
   who is adding the file, which is the one moment anyone would listen. Git-ignored material stays invisible. */
const tracked = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
  cwd: ROOT,
  encoding: "utf8",
})
  .split("\0")
  .filter(Boolean);
const byBasename = new Map();
for (const p of tracked) {
  const base = p.split("/").pop();
  if (!byBasename.has(base)) byBasename.set(base, []);
  byBasename.get(base).push(p);
}
const fileCache = new Map();
function text(rel) {
  if (!fileCache.has(rel)) {
    try {
      fileCache.set(rel, readFileSync(join(ROOT, rel), "utf8"));
    } catch {
      fileCache.set(rel, null);
    }
  }
  return fileCache.get(rel);
}

/** resolve `docs/x.md#anchor`, `src/lib/engine.ts#symbol`, `foo.test.ts`, `scripts/x.mjs` */
function resolveCitation(raw) {
  const [pathPart, anchor] = raw.split("#");
  const path = pathPart.trim();
  if (!path) return { ok: false, why: "empty path" };
  let rel = null;
  if (path.includes("/")) {
    if (existsSync(join(ROOT, path))) rel = path;
    else {
      const guess = posix.join("docs", path).replace("docs/docs/", "docs/");
      if (existsSync(join(ROOT, guess))) rel = guess;
    }
  } else {
    const candidates = byBasename.get(path) ?? [];
    if (candidates.length) rel = candidates[0];
  }
  if (!rel) return { ok: false, why: `no such file: ${path}` };

  const body = text(rel);
  if (body === null) return { ok: false, why: `${rel} is tracked but unreadable` };
  if (!anchor) return { ok: true };

  if (rel.endsWith(".md")) {
    const hit = body.split("\n").some((l) => /^#{1,6}\s/.test(l) && l.toLowerCase().includes(anchor.toLowerCase()));
    return hit ? { ok: true } : { ok: false, why: `${rel} has no heading containing “${anchor}”` };
  }
  const sym = anchor.replace(/\(.*\)$/, "").trim();
  const re = new RegExp(`\\b${sym.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
  return re.test(body) ? { ok: true } : { ok: false, why: `${rel} does not mention “${sym}”` };
}

/* A reference is a *path* (`src/…`, `docs/…`, `scripts/…`, `ci/…`), or one of the two bare names the
   convention allows: a test file (`schema.test.ts`) and an ADR (`adr-003-….md`). Bare `foo.json` / `diary.md`
   are prose about the canvas file format — a data file the app writes, not a file in this repository — and the
   gate must not pretend to know where they live, or every honest sentence about `state.json` becomes a failure. */
const CITATION =
  /(?:src|docs|scripts|ci|tests|ci)\/[\w./#-]+\.(?:tsx|ts|mjs|md|json|ya?ml)(?:#[\w.][\w.#-]*)?|\b[\w.-]+\.test\.ts|\badr-\d{3}-[\w-]+\.md/g;

/** every citation in a body, minus the ones inside the frontmatter `sources:` line (checked separately) */
function citationsIn(bodyText) {
  return [...new Set(bodyText.match(CITATION) ?? [])];
}

const problems = [];
const fail = (file, msg) => problems.push(`${file}: ${msg}`);

const docs = tracked.filter((p) => p.startsWith("docs/") && p.endsWith(".md") && !EXEMPT.has(p));
const isReadme = (p) => p.split("/").pop() === "README.md";
let checkedLinks = 0;

for (const file of docs) {
  const body = text(file);
  if (body === null) {
    fail(file, "tracked but unreadable");
    continue;
  }
  const parts = file.split("/");
  const isRootDoc = parts.length === 2;
  const dir = isRootDoc ? "" : parts[1] ?? "";
  const lines = body.split("\n");

  /* frontmatter — the leading-blank-line bug is a real one, so byte zero matters */
  if (!isReadme(file)) {
    if (lines[0] !== "---") {
      fail(file, "frontmatter must start on line 1 with exactly `---` (a leading blank line makes the block invisible to any parser)");
      continue;
    }
    const end = lines.indexOf("---", 1);
    if (end < 0) {
      fail(file, "frontmatter is never closed");
      continue;
    }
    const meta = new Map();
    for (const l of lines.slice(1, end)) {
      const m = l.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
      if (m) meta.set(m[1], m[2].trim());
      else if (l.trim()) fail(file, `unparseable frontmatter line: ${JSON.stringify(l)}`);
    }
    for (const k of REQUIRED_KEYS) if (!meta.has(k)) fail(file, `frontmatter is missing \`${k}\``);

    const phaseLine = lines.findIndex((l) => /^\s*phase:/.test(l));
    if (phaseLine >= 0) fail(file, "`phase:` is banned in docs/ — scheduling lives in the roadmap filename (`docs/roadmap/README.md`)");

    const status = meta.get("status");
    const allowed = isRootDoc ? ROOT_STATUS : STATUS[dir];
    if (status && allowed && !allowed.includes(status))
      fail(file, `status “${status}” is not legal ${isRootDoc ? "at the root of docs/" : `under ${dir}/`} (allowed: ${allowed.join(", ")})`);
    if (status === "superseded" && !meta.get("superseded_by")) fail(file, "a superseded decision must name its successor (`superseded_by:`)");
    const upd = meta.get("updated");
    if (upd && !/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(upd))
      fail(file, `updated must be a real YYYY-MM-DD date, got “${upd}”`);

    /* sources: [a, b] */
    const src = meta.get("sources") ?? "";
    const list = src.replace(/^\[|\]$/g, "").split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
    if (!list.length) fail(file, "`sources` must list at least one reference — a doc that names nothing will rot silently");
    for (const s of list) {
      checkedLinks++;
      const r = resolveCitation(s);
      if (!r.ok) fail(file, `sources: ${r.why}`);
    }

    /* body length: an ADR is short by construction */
    const bodyLines = lines.slice(end + 1).filter((l) => l.trim()).length;
    const cap = isRootDoc ? ROOT_CAP : BODY_CAP[dir];
    if (cap && bodyLines > cap)
      fail(file, `body is ${bodyLines} non-empty lines, the cap for ${isRootDoc ? "a docs/ root doc" : `${dir}/`} is ${cap}`);
  }

  /* every citation in the prose must resolve — this is the whole reason the file exists */
  for (const c of citationsIn(lines.filter((l) => !/^\s*(title|status|updated|sources|superseded_by):/.test(l)).join("\n"))) {
    checkedLinks++;
    const r = resolveCitation(c);
    if (!r.ok) fail(file, `dead reference “${c}” — ${r.why}`);
  }

  /* shipped claims need a guard */
  if (dir === "roadmap") {
    // a row is its bullet *plus* the wrapped lines under it: a citation on line two still guards the claim,
    // and refusing that would teach people to write ugly one-line rows instead of to cite
    lines.forEach((l, i) => {
      if (!/^\s*-\s*\[x\]/.test(l)) return;
      let row = l;
      for (let j = i + 1; j < lines.length && /^\s+\S/.test(lines[j]); j++) row += " " + lines[j].trim();
      const cited = citationsIn(row).some((c) => resolveCitation(c).ok);
      if (!cited) fail(file, `line ${i + 1}: a \`[x]\` row must cite its guard (a \`*.test.ts\`, a doc, or a script)`);
    });
  }
}

/* the decisions index must know about every ADR — nobody is counting by hand any more */
const index = text("docs/decisions/README.md") ?? "";
for (const adr of tracked.filter((p) => /^docs\/decisions\/adr-[\w-]+\.md$/.test(p))) {
  if (!index.includes(adr.split("/").pop())) fail("docs/decisions/README.md", `${adr.split("/").pop()} is not listed in the index`);
}
for (const ref of index.match(/adr-\d{3}-[\w-]+\.md/g) ?? []) {
  if (!tracked.includes(`docs/decisions/${ref}`) && !existsSync(join(ROOT, `docs/decisions/${ref}`)))
    fail("docs/decisions/README.md", `index mentions ${ref}, which does not exist (reserve a number in prose, not as a ghost row)`);
}

const summary = `docs check: ${docs.length} file(s), ${checkedLinks} reference(s) resolved`;
if (problems.length) {
  console.error(problems.join("\n"));
  console.error(`${problems.length} problem(s) — ${summary}`);
  process.exit(1);
}
console.log(`${summary}, 0 problems`);
