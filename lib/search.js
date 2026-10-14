// Finds the parts of a long notice worth sending to a model.
// A 132-page notice is about 55,000 tokens and the free tier allows 8,000 a minute,
// so each question gets only the passages that score best for its keywords (BM25).

const STOP = new Set(
  "the of and to in a an for or be is are by on at as with which from that this will shall any such not all may has have their his her its it who whom only than also other into under".split(" "),
);

function stem(w) {
  if (w.length > 5 && w.endsWith("ies")) return w.slice(0, -3) + "y";
  if (w.length > 4 && w.endsWith("es")) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
}

export function tokens(s) {
  return (String(s).toLowerCase().match(/[a-z0-9]+/g) || []).filter((w) => !STOP.has(w)).map(stem);
}

// Overlapping windows of about `size` characters, cut at line ends where possible.
export function passages(pages, size = 900, step = 600) {
  const out = [];
  pages.forEach((text, i) => {
    const t = String(text || "");
    for (let start = 0; start < t.length; start += step) {
      let s = start;
      if (s > 0) {
        const nl = t.indexOf("\n", s);
        if (nl !== -1 && nl - s < 120) s = nl + 1;
      }
      let e = Math.min(t.length, s + size);
      if (e < t.length) {
        const nl = t.lastIndexOf("\n", e);
        if (nl > s + size * 0.6) e = nl;
      }
      out.push({ page: i + 1, start: s, end: e, text: t.slice(s, e) });
      if (e >= t.length) break;
    }
  });
  return out;
}

export function rank(items, query) {
  const docs = items.map((p) => tokens(p.text));
  const avg = docs.reduce((a, d) => a + d.length, 0) / Math.max(docs.length, 1);
  const df = new Map();
  for (const d of docs) for (const w of new Set(d)) df.set(w, (df.get(w) || 0) + 1);
  const q = [...new Set(tokens(query))];
  const k1 = 1.4;
  const b = 0.75;
  return items
    .map((p, i) => {
      const tf = new Map();
      for (const w of docs[i]) tf.set(w, (tf.get(w) || 0) + 1);
      let score = 0;
      for (const w of q) {
        const f = tf.get(w);
        if (!f) continue;
        const idf = Math.log(1 + (docs.length - df.get(w) + 0.5) / (df.get(w) + 0.5));
        score += (idf * f * (k1 + 1)) / (f + k1 * (1 - b + (b * docs[i].length) / avg));
      }
      return { ...p, score };
    })
    .filter((p) => p.score > 0)
    .sort((a, b) => b.score - a.score);
}

// The best passages for a set of queries, up to `budget` characters, merged where they
// overlap and put back in page order so tables and numbered paragraphs read naturally.
export function excerpts(pages, queries, budget = 12_000) {
  const all = passages(pages);
  const picked = [];
  let used = 0;
  const lists = queries.map((q) => rank(all, q));
  // take the best from each query in turn, so one keyword-heavy query can't use the whole budget
  for (let round = 0; used < budget && lists.some((l) => l.length > round); round++) {
    for (const list of lists) {
      const p = list[round];
      if (!p || picked.some((x) => x.page === p.page && x.start === p.start)) continue;
      if (used + p.text.length > budget) continue;
      picked.push(p);
      used += p.text.length;
    }
  }

  picked.sort((a, b) => a.page - b.page || a.start - b.start);
  const merged = [];
  for (const p of picked) {
    const last = merged.at(-1);
    if (last && last.page === p.page && p.start <= last.end) last.end = Math.max(last.end, p.end);
    else merged.push({ page: p.page, start: p.start, end: p.end });
  }
  return merged.map((m) => ({ page: m.page, text: String(pages[m.page - 1]).slice(m.start, m.end).trim() }));
}

export function asPrompt(parts) {
  return parts.map((p) => `[page ${p.page}]\n${p.text}`).join("\n\n");
}
