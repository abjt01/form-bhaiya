// Reads a notice in five small questions instead of one big one. Each question gets only the
// passages that matter to it, so it fits the free tier, and every answer comes back with quotes
// that are checked against the PDF text before anyone sees them.
import { isISO } from "./dates.js";
import { CATEGORIES } from "./eligibility.js";
import { chatJSON } from "./llm.js";
import { asPrompt, excerpts } from "./search.js";
import { verify } from "./verify.js";

// Three lanes, because the free tier's limit is per model: the hard reading goes to the big model,
// lists go to the small ones, and all three run at once.
export const MODELS = {
  big: process.env.READ_MODEL || "openai/gpt-oss-120b",
  small: process.env.READ_MODEL_SMALL || "openai/gpt-oss-20b",
  side: process.env.READ_MODEL_SIDE || "qwen/qwen3.8-27b",
};

export function isMock() {
  return process.env.MOCK_READER === "1" || (!process.env.GROQ_API_KEY && !process.env.LLM_BASE_URL);
}

export const SYSTEM = `You read Indian government recruitment and exam notices for the person at a cyber café who fills in application forms for candidates.

You get excerpts from one notice. Each excerpt starts with [page N].

Rules:
- Use only the excerpts. If they don't say something, leave it out. Never fill gaps from general knowledge of other exams.
- Every item you return has "quote": a phrase copied exactly, word for word, from one excerpt (20 to 200 characters, no "..."), and "page": the N of that excerpt. The quote must contain the item's dates and numbers.
- Dates are "YYYY-MM-DD". Indian notices write numeric dates day first: 09.06.2026 is 2026-06-09.
- Reply with one JSON object and nothing else.`;

const tagHelp = `"categories" uses only these codes: ${CATEGORIES.join(", ")} (GEN is unreserved / general). An empty list means any category. "SC/ST" is ["SC","ST"]. "pwbd", "esm" and "women" are true when the row is only for persons with benchmark disabilities, ex-servicemen or women, otherwise null. A row is everyone who matches all of its conditions, so write separate rows for separate groups.`;

export const JOBS = [
  {
    key: "basics",
    label: "Exam, dates and fees",
    model: "big",
    maxTokens: 4000,
    queries: [
      "name of examination notice recruitment commission",
      "important dates last date closing date receipt online application",
      "last date time online fee payment",
      "window application form correction modification",
      "schedule date of examination computer based tier",
      "fee payable exempted payment fee concession",
    ],
    budget: 11_000,
    ask: `Return:
{
  "exam": { "name": "full exam name and year", "body": "who conducts it", "quote": "...", "page": 1 },
  "website": { "url": "where to apply", "quote": "...", "page": 1 } or null,
  "dates": [ { "what": "short label in words, e.g. Online applications close", "kind": "apply_start | apply_end | fee_end | correction_start | correction_end | exam | other", "date": "YYYY-MM-DD", "time": "HH:MM 24h or null", "quote": "...", "page": 1 } ],
  "fees": [ { "label": "who this row is for, e.g. Women, SC/ST", "amount": 100, "categories": [], "pwbd": null, "esm": null, "women": null, "quote": "...", "page": 1 } ]
}
For fees, the normal fee is a row for everyone (empty categories, nulls). Each exempted group is its own row with amount 0. ${tagHelp}`,
  },
  {
    key: "age",
    label: "Age limits and relaxations",
    model: "big",
    maxTokens: 4000,
    queries: [
      "age limit born not earlier than not later than",
      "age years as on crucial date determining age",
      "relaxation upper age limit SC ST OBC PwBD ex-servicemen years",
    ],
    budget: 12_000,
    ask: `Return:
{
  "rules": [ { "appliesTo": "the posts, academy or group as the notice names them, e.g. 'Posts with age limit 18-27 years'; 'All posts' only if there is one rule", "sex": "male | female | null", "bornFrom": "earliest allowed birth date YYYY-MM-DD or null", "bornTo": "latest allowed birth date YYYY-MM-DD or null", "minAge": 18, "maxAge": 27, "asOn": "YYYY-MM-DD the age is counted on, or null", "notes": "marital status or other conditions, or null", "quote": "...", "page": 1 } ],
  "relaxations": [ { "label": "as the notice names the group", "years": 5, "categories": [], "pwbd": null, "esm": null, "women": null, "manual": false, "quote": "...", "page": 1 } ]
}
"born not earlier than X and not later than Y" means bornFrom X and bornTo Y. Copy the dates, don't calculate them. A rule can run over a page break ("Page 6 of 132" in the middle of a sentence); join it up. Leave minAge/maxAge null if the notice doesn't give them.
List every row of the relaxation table, including combined rows such as "PwBD (SC/ST)". For relaxations, "years" is the extra years added to the upper age limit. Set "manual": true when the row depends on something other than category, disability, ex-serviceman or sex (government employees, widows, length of service, a fixed age cap such as "up to 40 years"), or when years isn't a plain number. ${tagHelp}`,
  },
  {
    key: "uploads",
    label: "Photo and signature",
    model: "small",
    maxTokens: 2500,
    queries: [
      "photograph upload jpg jpeg kb size pixels",
      "signature upload kb cm width height dimension",
      "thumb impression handwritten declaration upload",
      "live photograph capture camera",
    ],
    budget: 9_000,
    ask: `Return:
{
  "items": [ { "kind": "photo | signature | thumb | declaration | other", "label": "short name", "live": false, "format": "JPG or null", "minKB": 10, "maxKB": 20, "widthPx": null, "heightPx": null, "widthCm": 6.0, "heightCm": 2.0, "notes": "under 20 words: background, cap, glasses, name and date on photo; or null", "quote": "...", "page": 1 } ]
}
"live": true means the photo is taken on the spot with a camera during the application, not uploaded, and then it has no sizes. Each item's sizes must come from a sentence about that same item: a signature's size is never a photo's size. Use null for any size the notice doesn't give. If the notice only says to see instructions on a website, return one item with kind "other" that quotes that.`,
  },
  {
    key: "education",
    label: "Who can apply",
    model: "side",
    // Groq caps Qwen at 1,000 output tokens a minute and refuses any request that asks for more
    maxTokens: 1000,
    queries: [
      "educational qualification essential degree university recognised",
      "final year appearing candidates result eligible",
      "nationality citizenship citizen of india",
      "marital status unmarried physical standards",
    ],
    budget: 8_000,
    ask: `Return:
{
  "items": [ { "appliesTo": "post, academy or 'All'", "requirement": "the qualification in plain words, one sentence", "quote": "...", "page": 1 } ],
  "finalYear": { "allowed": true, "detail": "one sentence", "quote": "...", "page": 1 } or null
}
Include education, nationality and marital status requirements, one item each per post or group. "requirement" holds only that requirement: no ages or birth dates, those are read separately.`,
  },
  {
    key: "documents",
    label: "Documents to bring",
    model: "small",
    maxTokens: 2500,
    queries: [
      "documents certificates upload required application",
      "certificate format caste OBC non creamy layer EWS",
      "original documents verification produce",
      "photo identity proof admission certificate examination hall bring",
    ],
    budget: 9_000,
    ask: `Return:
{
  "items": [ { "name": "the document, short, e.g. OBC certificate (non-creamy layer)", "when": "apply | exam_day | verification | null", "quote": "...", "page": 1 } ]
}
List each distinct document or certificate the candidate must upload, carry or produce, at most 15. Portal steps (registration numbers, forms to fill, modules) and general instructions are not documents.`,
  },
];

const str = (v, max = 300) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const num = (v) => {
  const n = typeof v === "string" ? Number(v.replace(/[^\d.]/g, "")) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};
// Cuts at a word so a long note doesn't end mid-word.
const short = (v, max) => {
  const t = str(v, 1000);
  if (!t) return null;
  if (t.length <= max) return t;
  return `${t.slice(0, t.lastIndexOf(" ", max - 1))}…`;
};
const bool = (v) => (v === true ? true : v === false ? false : null);
const date = (v) => (isISO(v) ? v : null);
const list = (v) => (Array.isArray(v) ? v : []);

function who(raw) {
  const cats = list(raw.categories)
    .map((c) => String(c).toUpperCase().trim())
    .map((c) => (c === "UR" || c === "GENERAL" ? "GEN" : c))
    .filter((c) => CATEGORIES.includes(c));
  return { categories: [...new Set(cats)], pwbd: raw.pwbd === true ? true : null, esm: raw.esm === true ? true : null, women: raw.women === true ? true : null };
}

function checked(pages, raw, facts) {
  return { quote: str(raw.quote, 400), page: num(raw.page), check: verify(pages, { quote: raw.quote, page: num(raw.page), ...facts }) };
}

const DATE_KINDS = ["apply_start", "apply_end", "fee_end", "correction_start", "correction_end", "exam", "other"];
const DATE_LABELS = {
  apply_start: "Online applications open",
  apply_end: "Online applications close",
  fee_end: "Last date for fee payment",
  correction_start: "Correction window opens",
  correction_end: "Correction window closes",
  exam: "Examination",
  other: "Other date",
};
const UPLOAD_KINDS = ["photo", "signature", "thumb", "declaration", "other"];
// What a quote has to talk about for an upload of that kind to count as read from it.
const UPLOAD_WORDS = { photo: /photo/i, signature: /signature/i, thumb: /thumb/i, declaration: /declaration/i };
// Relaxations that depend on service records, employment or domicile can't be applied from a category alone.
const NEEDS_A_HUMAN = /defen[cs]e|employee|service|widow|divorc|separated|sports|domicile|jammu|kashmir|up to \d+ years of age/i;

// Turns a model's answer into the shape the app uses, dropping anything malformed.
export function normalise(key, raw, pages) {
  raw = raw && typeof raw === "object" ? raw : {};
  if (key === "basics") {
    const exam = raw.exam && str(raw.exam.name) ? { name: str(raw.exam.name, 160), body: str(raw.exam.body, 160), ...checked(pages, raw.exam, {}) } : null;
    const website = raw.website && str(raw.website.url) ? { url: str(raw.website.url, 200), ...checked(pages, raw.website, {}) } : null;
    const seenDates = new Set();
    const dates = list(raw.dates)
      .filter((d) => date(d?.date) && str(d.what))
      .filter((d) => {
        const k = `${d.date}|${DATE_KINDS.includes(d.kind) && d.kind !== "other" ? d.kind : str(d.what).toLowerCase()}`;
        if (seenDates.has(k)) return false;
        seenDates.add(k);
        return true;
      })
      .slice(0, 12)
      .map((d) => ({
        what: DATE_KINDS.includes(str(d.what)) ? DATE_LABELS[d.what] : str(d.what, 80),
        kind: DATE_KINDS.includes(d.kind) ? d.kind : "other",
        date: d.date,
        time: /^\d{2}:\d{2}$/.test(d.time || "") ? d.time : null,
        ...checked(pages, d, { dates: [d.date] }),
      }));
    const fees = list(raw.fees)
      .filter((f) => num(f?.amount) !== null)
      .slice(0, 10)
      .map((f) => {
        const amount = num(f.amount);
        return { label: str(f.label, 80) || "Everyone", amount, ...who(f), ...checked(pages, f, { numbers: amount > 0 ? [amount] : [] }) };
      });
    return { exam, website, dates, fees };
  }

  if (key === "age") {
    const rules = list(raw.rules)
      .slice(0, 8)
      .map((r) => ({
        appliesTo: str(r?.appliesTo, 120) || "All posts",
        sex: r?.sex === "male" || r?.sex === "female" ? r.sex : null,
        bornFrom: date(r?.bornFrom),
        bornTo: date(r?.bornTo),
        minAge: num(r?.minAge),
        maxAge: num(r?.maxAge),
        asOn: date(r?.asOn),
        notes: str(r?.notes, 200) || null,
        raw: r,
      }))
      .filter((r) => (r.bornFrom && r.bornTo) || (r.asOn && r.minAge !== null && r.maxAge !== null))
      .map(({ raw: r, ...rule }) => ({
        ...rule,
        ...checked(pages, r, { dates: [rule.bornFrom, rule.bornTo].filter(Boolean) }),
      }));
    // several rules all called "All posts" tell the counter nothing; name them by their age range
    const names = rules.map((r) => r.appliesTo.toLowerCase());
    for (const r of rules) {
      if (names.filter((x) => x === r.appliesTo.toLowerCase()).length > 1 && r.minAge !== null && r.maxAge !== null) {
        r.appliesTo = `Posts with age limit ${r.minAge}–${r.maxAge} years`;
      }
    }
    const relaxations = list(raw.relaxations)
      .filter((r) => str(r?.label))
      .slice(0, 16)
      .map((r) => {
        const years = num(r.years);
        const group = who(r);
        return {
          label: str(r.label, 120),
          years,
          ...group,
          manual: r.manual === true || years === null || group.esm === true || NEEDS_A_HUMAN.test(`${r.label} ${r.quote}`),
          ...checked(pages, r, { numbers: years ? [years] : [] }),
        };
      });
    return { rules, relaxations };
  }

  if (key === "uploads") {
    const items = list(raw.items)
      .filter((u) => u && (str(u.label) || UPLOAD_KINDS.includes(u.kind)))
      .slice(0, 8)
      .map((u) => {
        const kind = UPLOAD_KINDS.includes(u.kind) ? u.kind : "other";
        const live = u.live === true;
        const size = live
          ? { minKB: null, maxKB: null, widthPx: null, heightPx: null, widthCm: null, heightCm: null }
          : { minKB: num(u.minKB), maxKB: num(u.maxKB), widthPx: num(u.widthPx), heightPx: num(u.heightPx), widthCm: num(u.widthCm), heightCm: num(u.heightCm) };
        const item = {
          kind,
          label: str(u.label, 80) || kind,
          live,
          format: str(u.format, 20) || null,
          ...size,
          notes: short(u.notes, 160),
          ...checked(pages, u, { numbers: Object.values(size).filter((n) => n !== null) }),
        };
        if (item.check.status === "verified" && UPLOAD_WORDS[kind] && !UPLOAD_WORDS[kind].test(item.quote)) {
          item.check = { status: "check", why: `The quote isn't about the ${kind}.`, page: item.check.page };
        }
        return item;
      })
      // a "photo" whose only evidence is the signature sentence is a mislabelled copy, not a second requirement
      .filter((u) => !(UPLOAD_WORDS[u.kind] && !UPLOAD_WORDS[u.kind].test(u.quote) && Object.values(UPLOAD_WORDS).some((re) => re.test(u.quote))));
    return { items };
  }

  if (key === "education") {
    const items = list(raw.items)
      .filter((e) => str(e?.requirement))
      .slice(0, 10)
      .map((e) => ({ appliesTo: str(e.appliesTo, 120) || "All", requirement: str(e.requirement, 300), ...checked(pages, e, {}) }));
    const f = raw.finalYear;
    const finalYear = f && typeof f === "object" && str(f.detail) ? { allowed: bool(f.allowed), detail: str(f.detail, 300), ...checked(pages, f, {}) } : null;
    return { items, finalYear };
  }

  if (key === "documents") {
    const seen = new Set();
    const items = list(raw.items)
      .filter((d) => str(d?.name))
      .filter((d) => {
        const k = str(d.name).toLowerCase();
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .slice(0, 15)
      .map((d) => ({
        name: str(d.name, 120),
        when: ["apply", "exam_day", "verification"].includes(d.when) ? d.when : null,
        ...checked(pages, d, {}),
      }));
    return { items };
  }
  return {};
}

export function jobPrompt(job, pages) {
  const parts = excerpts(pages, job.queries, job.budget);
  return { parts, user: `${job.ask}\n\nExcerpts from the notice:\n\n${asPrompt(parts)}` };
}

// An answer that leaves out something the excerpts clearly contain gets one more try.
export function looksIncomplete(key, result, excerptText) {
  if (key === "basics") return !result.exam || !result.dates.length;
  if (key === "age") return !result.rules.length || (!result.relaxations.length && /relax/i.test(excerptText));
  if (key === "uploads") return !result.items.length;
  if (key === "education") return !result.items.length;
  if (key === "documents") return !result.items.length;
  return false;
}

const size = (r) => JSON.stringify(r).length;

export async function runJob(job, pages) {
  if (isMock()) return normalise(job.key, mockAnswer(job.key, pages), pages);
  const { user, parts } = jobPrompt(job, pages);
  const ask = () =>
    chatJSON({
      model: MODELS[job.model],
      system: SYSTEM,
      user,
      temperature: 0.1,
      maxTokens: job.maxTokens || 3000,
      // medium effort sometimes thinks through the whole budget and the JSON gets cut off; low is complete and faster
      effort: job.model === "side" ? "none" : "low",
      attempts: 4,
      maxWait: 60_000,
    }).then((raw) => normalise(job.key, raw, pages));

  const first = await ask();
  if (!looksIncomplete(job.key, first, parts.map((p) => p.text).join("\n"))) return first;
  const second = await ask().catch(() => first);
  return size(second) > size(first) ? second : first;
}

// Without an AI key the app still runs (tests, CI, a first look). It answers for the demo
// notice in test/fixtures and knowingly gets one thing wrong, so the "check this" path shows up too.
function mockAnswer(key, pages) {
  const all = pages.join("\n");
  if (!/Demo Recruitment Board/i.test(all)) return {};
  const answers = {
    basics: {
      exam: { name: "Junior Assistant Examination, 2026", body: "Demo Recruitment Board", quote: "Junior Assistant Examination, 2026", page: 1 },
      website: { url: "https://example.org/apply", quote: "Applications must be submitted online at https://example.org/apply only", page: 1 },
      dates: [
        { what: "Online applications open", kind: "apply_start", date: "2026-10-01", time: null, quote: "Online applications open on 01.10.2026", page: 1 },
        { what: "Online applications close", kind: "apply_end", date: "2026-11-20", time: "23:00", quote: "Last date for online applications: 20.11.2026 (23:00 hours)", page: 1 },
        { what: "Last date for fee payment", kind: "fee_end", date: "2026-11-21", time: "23:00", quote: "Last date for online fee payment: 21.11.2026 (23:00 hours)", page: 1 },
        { what: "Written examination", kind: "exam", date: "2027-01-17", time: null, quote: "The written examination will be held on 17th January, 2027", page: 1 },
      ],
      fees: [
        { label: "Everyone else", amount: 100, categories: [], quote: "Fee payable: Rs. 100/- (Rupees One Hundred only)", page: 2 },
        { label: "Women", amount: 0, women: true, quote: "Women candidates and candidates belonging to SC, ST and PwBD are exempted from payment of fee", page: 2 },
        { label: "SC/ST", amount: 0, categories: ["SC", "ST"], quote: "Women candidates and candidates belonging to SC, ST and PwBD are exempted from payment of fee", page: 2 },
        { label: "PwBD", amount: 0, pwbd: true, quote: "Women candidates and candidates belonging to SC, ST and PwBD are exempted from payment of fee", page: 2 },
      ],
    },
    age: {
      rules: [
        { appliesTo: "Junior Assistant", bornFrom: "1999-01-02", bornTo: "2008-01-01", minAge: 18, maxAge: 27, asOn: "2026-01-01", quote: "born not earlier than 02.01.1999 and not later than 01.01.2008", page: 2 },
        { appliesTo: "Store Keeper", bornFrom: "1996-01-02", bornTo: "2006-01-01", minAge: 20, maxAge: 30, asOn: "2026-01-01", quote: "born not earlier than 02.01.1996 and not later than 01.01.2006", page: 2 },
      ],
      relaxations: [
        { label: "SC/ST", years: 5, categories: ["SC", "ST"], quote: "SC/ST 5 years", page: 2 },
        { label: "OBC", years: 3, categories: ["OBC"], quote: "OBC 3 years", page: 2 },
        { label: "PwBD", years: 10, pwbd: true, quote: "PwBD (Unreserved) 10 years", page: 2 },
        { label: "PwBD (OBC)", years: 13, categories: ["OBC"], pwbd: true, quote: "PwBD (OBC) 13 years", page: 2 },
        { label: "Ex-Servicemen", years: null, esm: true, manual: true, quote: "Ex-Servicemen: 3 years after deduction of military service rendered", page: 2 },
      ],
    },
    uploads: {
      items: [
        { kind: "photo", label: "Photograph", format: "JPG", minKB: 20, maxKB: 50, widthPx: 200, heightPx: 230, notes: "Light background, no cap or glasses. Name and date of photo printed below.", quote: "photograph in JPG format, 20 KB to 50 KB, 200 x 230 pixels", page: 3 },
        { kind: "signature", label: "Signature", format: "JPG", minKB: 10, maxKB: 20, widthCm: 6, heightCm: 2, quote: "signature in JPG format (10 to 20 KB), about 6.0 cm (width) x 2.0 cm (height)", page: 3 },
        // wrong on purpose: the notice says 20 to 50 KB
        { kind: "thumb", label: "Left thumb impression", format: "JPG", minKB: 20, maxKB: 60, quote: "left thumb impression in JPG format, 20 KB to 50 KB", page: 3 },
      ],
    },
    education: {
      items: [
        { appliesTo: "All posts", requirement: "Bachelor's degree from a recognised university.", quote: "Bachelor's Degree from a recognised University", page: 2 },
        { appliesTo: "All posts", requirement: "Must be a citizen of India.", quote: "A candidate must be a citizen of India", page: 2 },
      ],
      finalYear: { allowed: true, detail: "Final-year students can apply if they finish the degree by 01.01.2027.", quote: "Candidates appearing in the final year may also apply", page: 2 },
    },
    documents: {
      items: [
        { name: "Photo ID with date of birth (Aadhaar, PAN, Voter ID)", when: "exam_day", quote: "original valid photo identity card bearing date of birth", page: 3 },
        { name: "Caste certificate (SC/ST/OBC) in the prescribed format", when: "verification", quote: "Caste certificate in the prescribed format", page: 3 },
        { name: "Class 10 certificate (date of birth proof)", when: "verification", quote: "Matriculation certificate as proof of date of birth", page: 3 },
      ],
    },
  };
  return answers[key] || {};
}
