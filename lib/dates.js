// Dates the way Indian exam notices write them, and the calendar maths eligibility needs.
// Everything is a plain "YYYY-MM-DD" string so nothing shifts with time zones.

const MONTHS = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_NAMES_HI = ["जनवरी", "फ़रवरी", "मार्च", "अप्रैल", "मई", "जून", "जुलाई", "अगस्त", "सितंबर", "अक्टूबर", "नवंबर", "दिसंबर"];

const pad = (n) => String(n).padStart(2, "0");

export function isoDate(y, m, d) {
  y = Number(y);
  m = Number(m);
  d = Number(d);
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1) return null;
  if (d > daysInMonth(y, m)) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

export function isISO(s) {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-");
  return isoDate(y, m, d) === s;
}

function daysInMonth(y, m) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function parts(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return { y, m, d };
}

function toUTC(iso) {
  const { y, m, d } = parts(iso);
  return Date.UTC(y, m - 1, d);
}

function fromUTC(ms) {
  const t = new Date(ms);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

export function addDays(iso, n) {
  return fromUTC(toUTC(iso) + n * 86_400_000);
}

// 29 Feb plus a year lands on 28 Feb, which is how age rules treat leap-day birthdays.
export function addYears(iso, n) {
  const { y, m, d } = parts(iso);
  return `${y + n}-${pad(m)}-${pad(Math.min(d, daysInMonth(y + n, m)))}`;
}

export function daysBetween(from, to) {
  return Math.round((toUTC(to) - toUTC(from)) / 86_400_000);
}

export function ageOn(dob, on) {
  const a = parts(dob);
  const b = parts(on);
  let years = b.y - a.y;
  let months = b.m - a.m;
  let days = b.d - a.d;
  if (days < 0) {
    months -= 1;
    const pm = b.m === 1 ? 12 : b.m - 1;
    const py = b.m === 1 ? b.y - 1 : b.y;
    days += daysInMonth(py, pm);
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  return { years, months, days };
}

export function todayIST(now = new Date()) {
  return fromUTC(now.getTime() + 330 * 60_000);
}

export function formatDate(iso, lang = "en") {
  if (!isISO(iso)) return "";
  const { y, m, d } = parts(iso);
  return lang === "hi" ? `${d} ${MONTH_NAMES_HI[m - 1]} ${y}` : `${d} ${MONTH_NAMES[m - 1]} ${y}`;
}

export function weekday(iso) {
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(toUTC(iso)).getUTCDay()];
}

const NUMERIC = /(?<![\d.])(\d{1,2})\s*[./-]\s*(\d{1,2})\s*[./-]\s*(\d{4})(?!\d)/g;
const YMD = /(?<!\d)(\d{4})-(\d{2})-(\d{2})(?!\d)/g;
const MONTH_RE = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
const DAY_FIRST = new RegExp(`(?<!\\d)(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:of\\s+)?${MONTH_RE}\\.?,?\\s*(\\d{4})(?!\\d)`, "gi");
const MONTH_FIRST = new RegExp(`${MONTH_RE}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s*(\\d{4})(?!\\d)`, "gi");

// Every date written in a piece of notice text. Numeric dates are day first, as Indian notices write them.
export function findDates(text) {
  const s = String(text || "").replace(/\s+/g, " ");
  const found = new Set();
  for (const [, d, m, y] of s.matchAll(NUMERIC)) {
    const iso = isoDate(y, m, d);
    if (iso) found.add(iso);
  }
  for (const [, y, m, d] of s.matchAll(YMD)) {
    const iso = isoDate(y, m, d);
    if (iso) found.add(iso);
  }
  for (const [, d, mon, y] of s.matchAll(DAY_FIRST)) {
    const iso = isoDate(y, MONTHS[mon.toLowerCase()], d);
    if (iso) found.add(iso);
  }
  for (const [, mon, d, y] of s.matchAll(MONTH_FIRST)) {
    const iso = isoDate(y, MONTHS[mon.toLowerCase()], d);
    if (iso) found.add(iso);
  }
  return [...found];
}

// "14.03.2004", "14/3/2004", "2004-03-14" or "14 March 2004" typed into a form.
export function parseTypedDate(input) {
  const s = String(input || "").trim();
  if (isISO(s)) return s;
  const found = findDates(s);
  return found.length === 1 ? found[0] : null;
}
