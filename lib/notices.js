import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { todayIST } from "./dates.js";
import { HttpError } from "./http.js";
import { chatJSON } from "./llm.js";
import { pdfPages } from "./pdf.js";
import { JOBS, MODELS, isMock, runJob } from "./reader.js";
import { createStore } from "./store.js";

// One store per server process, kept on globalThis so dev reloads don't open a second one.
function store() {
  return (globalThis.__fbStore ||= createStore().then(async (s) => {
    await loadSeeds(s);
    return s;
  }));
}

// Notices read ahead of time ship in seed/, so a fresh server already has a library.
async function loadSeeds(s) {
  const dir = path.join(process.cwd(), /* turbopackIgnore: true */ "seed");
  let files = [];
  try {
    files = (await fs.readdir(dir)).filter((f) => f.endsWith(".json"));
  } catch {
    return;
  }
  for (const f of files) {
    try {
      const n = JSON.parse(await fs.readFile(path.join(dir, f), "utf8"));
      if (n?.id && !(await s.get(n.id))) await s.put({ ...n, seeded: true });
    } catch (err) {
      console.error(`seed ${f}:`, err.message);
    }
  }
}

// Changes to one notice happen one at a time, so three reading lanes finishing together don't lose writes.
const locks = (globalThis.__fbLocks ||= new Map());
async function withNotice(id, fn) {
  const prev = locks.get(id) || Promise.resolve();
  let release;
  const mine = new Promise((r) => (release = r));
  locks.set(id, prev.then(() => mine));
  await prev;
  try {
    const s = await store();
    const n = await s.get(id);
    if (!n) throw new HttpError(404, "No notice here.");
    const out = await fn(n);
    n.updatedAt = new Date().toISOString();
    await s.put(n);
    return out;
  } finally {
    release();
    if (locks.get(id) === mine) locks.delete(id);
  }
}

const newId = () => crypto.randomBytes(6).toString("base64url");

export function modelInfo() {
  return isMock() ? { mock: true } : { mock: false, ...MODELS };
}

export async function createNotice(bytes, fileName) {
  const s = await store();
  const sha = crypto.createHash("sha256").update(bytes).digest("hex");
  const known = await s.bySha(sha);
  if (known) return { id: known.id, existing: true };

  const pages = await pdfPages(bytes);
  const id = newId();
  const now = new Date().toISOString();
  await s.putPages(id, pages);
  await s.put({
    id,
    sha,
    fileName: String(fileName || "notice.pdf").slice(0, 120),
    pageCount: pages.length,
    createdAt: now,
    updatedAt: now,
    status: "reading",
    models: modelInfo(),
    jobs: Object.fromEntries(JOBS.map((j) => [j.key, { status: "waiting", label: j.label, model: isMock() ? "demo" : MODELS[j.model] }])),
    read: {},
    hi: null,
  });
  return { id, existing: false };
}

const running = (globalThis.__fbRunning ||= new Set());

// Reads every job that isn't done yet. The lanes run side by side, one model each.
export async function readNotice(id) {
  if (running.has(id)) return;
  running.add(id);
  try {
    const s = await store();
    const pages = await s.pages(id);
    const n = await s.get(id);
    if (!n) return;
    if (!pages) {
      await withNotice(id, (x) => {
        x.status = "failed";
        x.error = "The notice's text was lost when the server restarted. Upload the PDF again.";
      });
      return;
    }

    const todo = JOBS.filter((j) => n.jobs[j.key]?.status !== "done");
    const lanes = [...new Set(todo.map((j) => j.model))].map((m) => todo.filter((j) => j.model === m));
    await Promise.all(
      lanes.map(async (lane) => {
        for (const job of lane) {
          await withNotice(id, (x) => {
            x.jobs[job.key] = { ...x.jobs[job.key], status: "reading", startedAt: new Date().toISOString(), error: null };
          });
          try {
            const result = await runJob(job, pages);
            await withNotice(id, (x) => {
              x.read[job.key] = result;
              x.jobs[job.key] = { ...x.jobs[job.key], status: "done", doneAt: new Date().toISOString() };
            });
          } catch (err) {
            console.error(`reading ${id}/${job.key}:`, err.message);
            await withNotice(id, (x) => {
              x.jobs[job.key] = { ...x.jobs[job.key], status: "failed", error: "The model didn't answer in time." };
            });
          }
        }
      }),
    );

    await withNotice(id, (x) => {
      const states = Object.values(x.jobs).map((j) => j.status);
      x.status = states.every((st) => st === "done") ? "done" : states.some((st) => st === "done") ? "partial" : "failed";
    });
  } finally {
    running.delete(id);
  }
}

// A server that went to sleep mid-read (free hosting does that) picks the work back up on the next visit.
export function needsResume(n) {
  if (n.status !== "reading" || running.has(n.id)) return false;
  return Date.now() - new Date(n.updatedAt).getTime() > 90_000;
}

export async function retryNotice(id) {
  const s = await store();
  const n = await s.get(id);
  if (!n) throw new HttpError(404, "No notice here.");
  if (running.has(id)) return;
  if (!(await s.pages(id))) throw new HttpError(409, "The notice's text is gone. Upload the PDF again.");
  await withNotice(id, (x) => {
    x.status = "reading";
    for (const k of Object.keys(x.jobs)) if (x.jobs[k].status !== "done") x.jobs[k] = { ...x.jobs[k], status: "waiting", error: null };
  });
}

export async function getNotice(id) {
  const n = await (await store()).get(String(id || ""));
  if (!n) throw new HttpError(404, "No notice here.");
  return n;
}

export function publicNotice(n) {
  const { sha: _sha, ...rest } = n;
  return rest;
}

// The one date a café cares about first: when do applications close?
export function closesOn(n) {
  return n.read?.basics?.dates?.find((d) => d.kind === "apply_end")?.date || null;
}

export async function listNotices() {
  const all = await (await store()).list();
  const today = todayIST();
  return all.map((n) => {
    const closes = closesOn(n);
    return {
      id: n.id,
      name: n.read?.basics?.exam?.name || n.fileName,
      body: n.read?.basics?.exam?.body || "",
      fileName: n.fileName,
      pageCount: n.pageCount,
      status: n.status,
      closes,
      open: closes ? closes >= today : null,
      createdAt: n.createdAt,
    };
  });
}

// Short Hindi versions of the things a candidate takes home on the slip. Dates, fees and
// numbers are never translated by the model; the slip fills those in itself.
export function slipStrings(n) {
  const r = n.read || {};
  const out = [];
  for (const d of r.basics?.dates || []) out.push(d.what);
  for (const d of r.documents?.items || []) out.push(d.name);
  for (const e of r.education?.items || []) out.push(e.requirement);
  return [...new Set(out.filter(Boolean))].slice(0, 40);
}

export async function hindi(id) {
  const n = await getNotice(id);
  if (n.hi) return n.hi;
  if (n.status === "reading") throw new HttpError(409, "Still reading the notice.");
  const strings = slipStrings(n);
  if (!strings.length || isMock()) return {};

  const raw = await chatJSON({
    model: MODELS.small,
    system:
      "You translate short items from Indian exam notices into simple, everyday Hindi in Devanagari for candidates. Keep official names that people say in English (Aadhaar, PAN, OBC, EWS, SC, ST, PwBD, B.Sc.) in Latin letters. Use the words candidates use: Admission Certificate or Admit Card is प्रवेश पत्र, correction window is सुधार की तारीख़ें, fee is फ़ीस, certificate is प्रमाण पत्र. Don't add or drop anything. Reply with JSON only.",
    user: `Translate each item. Return {"hi": [...]} with exactly ${strings.length} strings in the same order.\n\n${JSON.stringify(strings)}`,
    temperature: 0.2,
    maxTokens: 3000,
    effort: "low",
  });
  const list = Array.isArray(raw?.hi) ? raw.hi : [];
  const hi = {};
  strings.forEach((s, i) => {
    const t = typeof list[i] === "string" ? list[i].trim() : "";
    if (t && /[ऀ-ॿ]/.test(t) && t.length < 400) hi[s] = t;
  });
  await withNotice(id, (x) => {
    x.hi = hi;
  });
  return hi;
}
