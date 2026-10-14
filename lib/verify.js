// Every fact the model reads out of a notice comes with a quote and a page number.
// Before anyone sees it, the quote has to be found on that page and every date and number
// in the fact has to be written there too. Anything that fails is shown as "check this".
import { findDates } from "./dates.js";

export function normalise(s) {
  return String(s || "")
    .normalize("NFKC")
    .toLowerCase()
    // PDFs use any quote mark for any other (SSC's fonts turn apostrophes into ‟), so they all become one
    .replace(/[‘’‚‛′`´„“”″‟"]/g, "'")
    .replace(/[‐‑‒–—―−]/g, "-")
    .replace(/([a-z])-\s*\n\s*([a-z])/g, "$1$2")
    .replace(/\s+/g, " ")
    .trim();
}

const words = (s) => normalise(s).match(/[\p{L}\p{N}]+/gu) || [];

// Where is this quote? Exact match first, then a close one: 85% of the quote's words,
// in a stretch of the page not much longer than the quote. PDFs split table cells
// and lines in odd places, so a word-level match is the honest middle ground.
export function locate(pages, quote, hint) {
  // models sometimes skip the middle of a sentence with "..."; then every piece has to be found, close together
  const pieces = String(quote || "")
    .split(/\.{3,}|…/)
    .map((x) => x.trim())
    .filter((x) => words(x).length >= 2);
  if (pieces.length > 1) {
    const found = pieces.map((x) => locateOne(pages, x, hint));
    if (found.some((f) => !f)) return null;
    const first = Math.min(...found.map((f) => f.page));
    if (found.some((f) => f.page - first > 1)) return null;
    return { page: first, match: "elided" };
  }
  return locateOne(pages, quote, hint);
}

function locateOne(pages, quote, hint) {
  const q = normalise(quote);
  if (q.length < 8) return null;
  const order = [...pages.keys()];
  if (Number.isInteger(hint) && hint >= 1 && hint <= pages.length) {
    order.sort((a, b) => Math.abs(a - (hint - 1)) - Math.abs(b - (hint - 1)));
  }
  const pair = (i) => (i + 1 < pages.length ? `${pages[i]}\n${pages[i + 1]}` : pages[i]);

  for (const i of order) {
    if (normalise(pages[i]).includes(q)) return { page: i + 1, match: "exact" };
  }
  // quotes that run over a page break
  for (const i of order) {
    if (i + 1 < pages.length && normalise(pair(i)).includes(q)) return { page: i + 1, match: "exact" };
  }

  const qWords = words(quote);
  if (qWords.length < 3) return null;
  let best = null;
  for (const i of order) {
    const score = closeness(words(pair(i)), qWords);
    if (score >= 0.85 && (!best || score > best.score)) best = { page: i + 1, match: "close", score };
  }
  return best && { page: best.page, match: best.match };
}

function closeness(pageWords, qWords) {
  const span = Math.ceil(qWords.length * 1.6);
  const want = new Map();
  for (const w of qWords) want.set(w, (want.get(w) || 0) + 1);
  let best = 0;
  const have = new Map();
  let hits = 0;
  for (let i = 0; i < pageWords.length; i++) {
    const w = pageWords[i];
    if (want.has(w)) {
      have.set(w, (have.get(w) || 0) + 1);
      if (have.get(w) <= want.get(w)) hits++;
    }
    if (i >= span) {
      const out = pageWords[i - span];
      if (want.has(out)) {
        if (have.get(out) <= want.get(out)) hits--;
        have.set(out, have.get(out) - 1);
      }
    }
    best = Math.max(best, hits / qWords.length);
  }
  return best;
}

// Numbers as written in notices: "₹100/-", "1,00,000", "10 to 20 KB", "3.5 cm".
export function numbersIn(text) {
  const out = new Set();
  for (const m of String(text || "").matchAll(/\d[\d,]*(?:\.\d+)?/g)) {
    const n = Number(m[0].replace(/,/g, ""));
    if (Number.isFinite(n)) out.add(n);
  }
  return out;
}

// Checks one fact: its quote is on the page it claims (or a neighbour, since quotes run over page breaks),
// and each of its dates and numbers appears in that text.
export function verify(pages, { quote, page, dates = [], numbers = [] }) {
  const where = locate(pages, quote, page);
  if (!where) return { status: "check", why: "The quote isn't in the notice.", page: Number.isInteger(page) ? page : null };

  const near = [where.page - 1, where.page, where.page + 1].filter((p) => p >= 1 && p <= pages.length);
  const text = near.map((p) => pages[p - 1]).join("\n");
  const seenDates = new Set(findDates(text));
  const seenNumbers = numbersIn(text);

  const missingDate = dates.find((d) => d && !seenDates.has(d));
  if (missingDate) return { status: "check", why: `The date ${missingDate} isn't on page ${where.page}.`, page: where.page };
  const missingNumber = numbers.find((n) => Number.isFinite(n) && !seenNumbers.has(n));
  if (missingNumber !== undefined) return { status: "check", why: `The number ${missingNumber} isn't on page ${where.page}.`, page: where.page };

  return { status: "verified", page: where.page, match: where.match };
}
