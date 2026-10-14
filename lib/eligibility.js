// Age and fee checks for one candidate against what was read from a notice.
// This is plain code on purpose: a model can read the notice, but it doesn't get to do the arithmetic.
import { addDays, addYears, daysBetween, isISO } from "./dates.js";

export const CATEGORIES = ["GEN", "EWS", "OBC", "SC", "ST"];
export const CATEGORY_NAMES = { GEN: "General (UR)", EWS: "EWS", OBC: "OBC", SC: "SC", ST: "ST" };

// An age rule either gives the birth window directly ("born not earlier than X and not later than Y")
// or an age range on a date ("18 to 27 years as on 01-08-2026"). Both end up as a birth window.
export function birthWindow(rule) {
  if (isISO(rule.bornFrom) && isISO(rule.bornTo)) return { from: rule.bornFrom, to: rule.bornTo, derived: false };
  if (isISO(rule.asOn) && Number.isFinite(rule.minAge) && Number.isFinite(rule.maxAge)) {
    return {
      // youngest allowed: turned minAge on or before the date
      to: addYears(rule.asOn, -rule.minAge),
      // oldest allowed: not yet maxAge + 1 on the date
      from: addDays(addYears(rule.asOn, -(rule.maxAge + 1)), 1),
      derived: true,
    };
  }
  return null;
}

// Does this group of people (a relaxation row or a fee row) include the candidate?
// Inside a row every condition must hold; "SC/ST" means either.
export function matches(row, c) {
  if (row.categories?.length && !row.categories.includes(c.category)) return false;
  if (row.pwbd === true && !c.pwbd) return false;
  if (row.pwbd === false && c.pwbd) return false;
  if (row.esm === true && !c.esm) return false;
  if (row.women === true && c.sex !== "female") return false;
  return true;
}

// The largest upper-age relaxation the candidate gets automatically, plus the ones a human has to judge.
export function relaxationFor(relaxations = [], c) {
  let best = null;
  const manual = [];
  for (const r of relaxations) {
    if (r.manual || !Number.isFinite(r.years)) {
      if (matches(r, c)) manual.push(r);
      continue;
    }
    if (!matches(r, c)) continue;
    if (!r.categories?.length && r.pwbd !== true && r.esm !== true && r.women !== true) continue; // a row for everyone isn't a relaxation
    if (!best || r.years > best.years) best = r;
  }
  return { best, manual };
}

export function checkAge(rule, c, relaxations = []) {
  const window = birthWindow(rule);
  if (!window) return { status: "unknown", why: "The notice's age rule couldn't be turned into dates. Check it by hand." };
  if (!isISO(c.dob)) return { status: "unknown", why: "Enter the date of birth." };

  if (rule.sex && c.sex && rule.sex !== c.sex) {
    return { status: "no", window, why: `Only ${rule.sex === "male" ? "men" : "women"} can apply for this.` };
  }

  const { best, manual } = relaxationFor(relaxations, c);
  const from = best ? addYears(window.from, -best.years) : window.from;

  if (c.dob > window.to) {
    const days = daysBetween(window.to, c.dob);
    return { status: "no", window, from, relaxation: best, manual, why: `Too young: born ${days} day${days === 1 ? "" : "s"} after the last allowed date.` };
  }
  if (c.dob < from) {
    const days = daysBetween(c.dob, from);
    return {
      status: manual.length ? "maybe" : "no",
      window,
      from,
      relaxation: best,
      manual,
      why: `Too old${best ? `, even with ${best.years} years of ${best.label} relaxation` : ""}: born ${days} day${days === 1 ? "" : "s"} before the earliest allowed date.`,
    };
  }
  if (c.dob < window.from) {
    return { status: "yes", window, from, relaxation: best, manual, why: `Eligible only because of the ${best.years}-year ${best.label} relaxation.` };
  }
  return { status: "yes", window, from, relaxation: best, manual, why: "Born inside the allowed window." };
}

// The candidate pays the lowest fee of any row they belong to; an exemption is a row with amount 0.
export function feeFor(fees = [], c) {
  const rows = fees.filter((f) => Number.isFinite(f.amount) && matches(f, c));
  if (!rows.length) return null;
  return rows.reduce((low, f) => (f.amount < low.amount ? f : low));
}

export function normaliseCandidate(raw = {}) {
  return {
    dob: isISO(raw.dob) ? raw.dob : "",
    category: CATEGORIES.includes(raw.category) ? raw.category : "GEN",
    sex: ["male", "female", "other"].includes(raw.sex) ? raw.sex : "male",
    pwbd: Boolean(raw.pwbd),
    esm: Boolean(raw.esm),
  };
}
