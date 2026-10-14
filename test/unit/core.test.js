import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addYears, ageOn, findDates, formatDate, isISO, parseTypedDate, todayIST } from "../../lib/dates.js";
import { birthWindow, checkAge, feeFor, normaliseCandidate, relaxationFor } from "../../lib/eligibility.js";
import { excerpts, passages, rank } from "../../lib/search.js";
import { locate, normalise, numbersIn, verify } from "../../lib/verify.js";

const cand = (o) => normaliseCandidate({ dob: "2002-05-14", category: "GEN", sex: "male", ...o });

describe("dates in notices", () => {
  it("reads numeric dates day first, the way Indian notices write them", () => {
    assert.deepEqual(findDates("Last date 09.06.2026 and fee by 10-06-2026, exam 13/09/2026"), ["2026-06-09", "2026-06-10", "2026-09-13"]);
  });

  it("reads written-out dates with ordinals and commas", () => {
    assert.deepEqual(findDates("born not earlier than 1st July, 2003 and not later than 1st July 2008"), ["2003-07-01", "2008-07-01"]);
    assert.deepEqual(findDates("upto 6:00 P.M. of 9th June, 2026"), ["2026-06-09"]);
    assert.deepEqual(findDates("on June 22, 2026"), ["2026-06-22"]);
    assert.deepEqual(findDates("on 22nd of Sept. 2026"), ["2026-09-22"]);
  });

  it("reads dates broken across a line", () => {
    assert.deepEqual(findDates("not later\nthan 01-08-\n2008."), ["2008-08-01"]);
    assert.deepEqual(findDates("earlier than 02-08-1999 and not later\nthan 01-08-2008."), ["1999-08-02", "2008-08-01"]);
  });

  it("ignores impossible dates and other numbers", () => {
    assert.deepEqual(findDates("31.02.2026, 12,256 posts, Rs 100, version 1.2.3"), []);
  });

  it("does calendar maths without time zones", () => {
    assert.equal(addYears("2004-02-29", -1), "2003-02-28");
    assert.deepEqual(ageOn("2002-08-02", "2026-08-01"), { years: 23, months: 11, days: 30 });
    assert.equal(formatDate("2026-06-09"), "9 Jun 2026");
    assert.equal(formatDate("2026-06-09", "hi"), "9 जून 2026");
    assert.equal(todayIST(new Date("2026-10-14T20:00:00Z")), "2026-10-15");
  });

  it("accepts typed dates of birth in the usual shapes", () => {
    assert.equal(parseTypedDate("14.03.2004"), "2004-03-14");
    assert.equal(parseTypedDate("14/3/2004"), "2004-03-14");
    assert.equal(parseTypedDate("2004-03-14"), "2004-03-14");
    assert.equal(parseTypedDate("14 March 2004"), "2004-03-14");
    assert.equal(parseTypedDate("2004"), null);
    assert.equal(isISO("2026-13-01"), false);
  });
});

describe("age rules", () => {
  const cgl = { bornFrom: "1999-08-02", bornTo: "2008-08-01" };
  const relax = [
    { label: "SC/ST", years: 5, categories: ["SC", "ST"] },
    { label: "OBC", years: 3, categories: ["OBC"] },
    { label: "PwBD", years: 10, categories: [], pwbd: true },
    { label: "PwBD (OBC)", years: 13, categories: ["OBC"], pwbd: true },
    { label: "PwBD (SC/ST)", years: 15, categories: ["SC", "ST"], pwbd: true },
    { label: "Ex-Servicemen", years: 3, categories: [], esm: true, manual: true },
  ];

  it("works out a window from an age range only when the notice prints no birth dates, and says so", () => {
    // SSC prints 02-08-1999 for "18-27 as on 01-08-2026", a year narrower than "not more than 27",
    // which is exactly why the printed dates win and a worked-out window is marked
    const w = birthWindow({ minAge: 18, maxAge: 27, asOn: "2026-08-01" });
    assert.deepEqual(w, { from: "1998-08-02", to: "2008-08-01", derived: true });
    assert.deepEqual(birthWindow({ bornFrom: "1999-08-02", bornTo: "2008-08-01", minAge: 18, maxAge: 27, asOn: "2026-08-01" }), {
      from: "1999-08-02",
      to: "2008-08-01",
      derived: false,
    });
  });

  it("is exact to the day at both edges", () => {
    assert.equal(checkAge(cgl, cand({ dob: "1999-08-02" })).status, "yes");
    assert.equal(checkAge(cgl, cand({ dob: "2008-08-01" })).status, "yes");
    const old = checkAge(cgl, cand({ dob: "1999-08-01" }));
    assert.equal(old.status, "no");
    assert.match(old.why, /1 day before/);
    const young = checkAge(cgl, cand({ dob: "2008-08-02" }));
    assert.equal(young.status, "no");
    assert.match(young.why, /Too young: born 1 day after/);
  });

  it("applies the biggest relaxation the candidate belongs to", () => {
    assert.equal(relaxationFor(relax, cand({ category: "OBC" })).best.years, 3);
    assert.equal(relaxationFor(relax, cand({ category: "OBC", pwbd: true })).best.years, 13);
    assert.equal(relaxationFor(relax, cand({ category: "ST", pwbd: true })).best.years, 15);
    assert.equal(relaxationFor(relax, cand({ category: "GEN", pwbd: true })).best.years, 10);
    assert.equal(relaxationFor(relax, cand({ category: "EWS" })).best, null);
  });

  it("says when only the relaxation makes someone eligible", () => {
    const r = checkAge(cgl, cand({ dob: "1996-01-10", category: "SC" }), relax);
    assert.equal(r.status, "yes");
    assert.match(r.why, /5-year SC\/ST relaxation/);
    assert.equal(checkAge(cgl, cand({ dob: "1996-01-10", category: "GEN" }), relax).status, "no");
  });

  it("leaves service-based relaxations to a human", () => {
    const r = checkAge(cgl, cand({ dob: "1990-01-01", esm: true }), relax);
    assert.equal(r.status, "maybe");
    assert.equal(r.manual[0].label, "Ex-Servicemen");
  });

  it("knows a rule for men only", () => {
    const ima = { bornFrom: "2003-07-01", bornTo: "2008-07-01", sex: "male" };
    assert.equal(checkAge(ima, cand({ dob: "2005-01-01", sex: "female" })).status, "no");
    assert.equal(checkAge(ima, cand({ dob: "2005-01-01" })).status, "yes");
  });

  it("says so when a rule can't be checked", () => {
    assert.equal(checkAge({ appliesTo: "?" }, cand()).status, "unknown");
    assert.equal(checkAge(cgl, cand({ dob: "" })).status, "unknown");
  });
});

describe("fees", () => {
  const fees = [
    { label: "Everyone", amount: 100, categories: [] },
    { label: "Women", amount: 0, categories: [], women: true },
    { label: "SC/ST", amount: 0, categories: ["SC", "ST"] },
    { label: "PwBD", amount: 0, categories: [], pwbd: true },
  ];
  it("charges the lowest fee the candidate qualifies for", () => {
    assert.equal(feeFor(fees, cand()).amount, 100);
    assert.equal(feeFor(fees, cand({ sex: "female" })).amount, 0);
    assert.equal(feeFor(fees, cand({ category: "ST" })).label, "SC/ST");
    assert.equal(feeFor(fees, cand({ category: "OBC" })).amount, 100);
    assert.equal(feeFor([], cand()), null);
  });
});

describe("checking quotes against the notice", () => {
  const pages = [
    "Notice No. 04/2026\nLast date for receipt of online applications 22.06.2026 (23:00 hours)",
    "10.1 Fee payable: ₹100/- (Rs one hundred only).\n10.2 Women candidates and candidates belonging to Scheduled Castes (SC), Scheduled Tribes (ST) are exempted from payment of fee.",
    "9.6 Candidates are required to upload the scanned signature in JPEG/JPG\nformat (10 to 20 KB). Image dimension of the signature should be about 6.0 cm\n(width) x 2.0 cm (height).",
  ];

  it("normalises quotes, dashes and line breaks", () => {
    assert.equal(normalise("Candidate‟s  “form” – \nNOW"), "candidate's 'form' - now");
    assert.deepEqual([...numbersIn("₹1,00,000/- and 3.5 cm")], [100000, 3.5]);
  });

  it("finds an exact quote even when the model gives the wrong page", () => {
    assert.deepEqual(locate(pages, "Fee payable: ₹100/- (Rs one hundred only)", 3), { page: 2, match: "exact" });
  });

  it("finds a quote the PDF broke across lines", () => {
    assert.equal(locate(pages, "upload the scanned signature in JPEG/JPG format (10 to 20 KB)", 3).page, 3);
  });

  it("finds a quote that runs over a page break", () => {
    const split = ["Candidate must have been born not\nearlier than 02-08-1996 and not later", "than 01-08-2008.\n5.2 Permissible relaxation"];
    assert.deepEqual(locate(split, "born not earlier than 02-08-1996 and not later than 01-08-2008", 1), { page: 1, match: "exact" });
  });

  it("accepts a quote with its middle skipped, but only if every piece is there", () => {
    assert.deepEqual(locate(pages, "Women candidates ... are exempted from payment of fee", 1), { page: 2, match: "elided" });
    assert.equal(locate(pages, "Women candidates … are exempted from all examinations", 1), null);
  });

  it("accepts a close quote but not an invented one", () => {
    assert.equal(locate(pages, "Women candidates and candidates of Scheduled Castes (SC), Scheduled Tribes (ST) are exempted from payment of fee", 2).match, "close");
    assert.equal(locate(pages, "Candidates must upload a photograph between 20 KB and 50 KB", 3), null);
  });

  it("fails a fact whose number or date isn't on the page", () => {
    const quote = "upload the scanned signature in JPEG/JPG format (10 to 20 KB)";
    assert.equal(verify(pages, { quote, page: 3, numbers: [10, 20, 6, 2] }).status, "verified");
    const wrong = verify(pages, { quote, page: 3, numbers: [10, 50] });
    assert.equal(wrong.status, "check");
    assert.match(wrong.why, /50/);
    const date = verify(pages, { quote: "Last date for receipt of online applications 22.06.2026", page: 1, dates: ["2026-06-23"] });
    assert.equal(date.status, "check");
    assert.equal(verify(pages, { quote: "Last date for receipt of online applications 22.06.2026", page: 1, dates: ["2026-06-22"] }).status, "verified");
  });
});

describe("finding the right passages", () => {
  const pages = [
    "General instructions about the examination hall and conduct.",
    "5. Age limit (As on 01-08-2026): Candidate must have been born not earlier than 02-08-1999 and not later than 01-08-2008.",
    "10. Application Fee: Fee payable ₹100. Women are exempted from payment of fee.",
  ];

  it("ranks the page that answers the question first", () => {
    assert.equal(rank(passages(pages), "age limit born not earlier than")[0].page, 2);
    assert.equal(rank(passages(pages), "fee payable exempted")[0].page, 3);
  });

  it("keeps excerpts in page order and inside the budget", () => {
    const ex = excerpts(pages, ["fee payable", "age limit born"], 10_000);
    assert.deepEqual(ex.map((e) => e.page), [2, 3]);
    assert.ok(excerpts(pages, ["fee", "age", "examination"], 130).reduce((a, e) => a + e.text.length, 0) <= 130);
  });

  it("carries a sentence cut by the page break over from the next page", () => {
    const split = ["5.1 For posts with age limit 18-30 years: born not earlier than 02-08-1996 and not later", "than 01-08-2008.\nMore text on the next page about something else entirely."];
    const [ex] = excerpts(split, ["age limit born not earlier"], 10_000);
    assert.equal(ex.page, 1);
    assert.match(ex.text, /not later\nthan 01-08-2008/);
  });

  it("splits long pages into overlapping windows", () => {
    const long = Array.from({ length: 60 }, (_, i) => `Line ${i} of a long page about the examination.`).join("\n");
    const ps = passages([long]);
    assert.ok(ps.length > 2);
    assert.ok(ps.every((p) => p.text.length <= 900));
    assert.ok(ps[1].start < ps[0].end);
  });
});

describe("reading answers", async () => {
  const { normalise: tidy, looksIncomplete } = await import("../../lib/reader.js");
  const pages = [
    "Last date for receipt of online applications 22.06.2026 (23:00 hours)\nLast date for receipt of online applications 22.06.2026 (23:00 hours)",
    "Candidate must have been born not earlier than 02-08-1999 and not later than 01-08-2008.\nCandidate must have been born not earlier than 02-08-1996 and not later than 01-08-2006.\n06 Ex-Servicemen (ESM) 3 years after deduction of the military service\n02 OBC 3 years",
    "Candidates are required to upload the scanned signature in JPEG format (10 to 20 KB). The photograph is captured live.",
  ];

  it("drops a date given twice and labels dates the model left as codes", () => {
    const r = tidy(
      "basics",
      {
        exam: { name: "X" },
        dates: [
          { what: "apply_end", kind: "apply_end", date: "2026-06-22", quote: "Last date for receipt of online applications 22.06.2026", page: 1 },
          { what: "Application deadline", kind: "apply_end", date: "2026-06-22", quote: "Last date for receipt of online applications 22.06.2026", page: 1 },
          { what: "Bad", kind: "exam", date: "22.06.2026", quote: "x", page: 1 },
        ],
      },
      pages,
    );
    assert.equal(r.dates.length, 1);
    assert.equal(r.dates[0].what, "Online applications close");
    assert.equal(r.dates[0].check.status, "verified");
  });

  it("names rules that were all called 'All posts' by their age range", () => {
    const r = tidy(
      "age",
      {
        rules: [
          { appliesTo: "All posts", bornFrom: "1999-08-02", bornTo: "2008-08-01", minAge: 18, maxAge: 27, quote: "born not earlier than 02-08-1999 and not later than 01-08-2008", page: 2 },
          { appliesTo: "All posts", bornFrom: "1996-08-02", bornTo: "2006-08-01", minAge: 20, maxAge: 30, quote: "born not earlier than 02-08-1996 and not later than 01-08-2006", page: 2 },
          { appliesTo: "Nobody", quote: "no dates at all", page: 2 },
        ],
        relaxations: [
          { label: "OBC", years: "3 years", categories: ["obc", "XYZ"], quote: "02 OBC 3 years", page: 2 },
          { label: "Ex-Servicemen (ESM)", years: 3, esm: true, quote: "06 Ex-Servicemen (ESM) 3 years after deduction of the military service", page: 2 },
        ],
      },
      pages,
    );
    assert.deepEqual(r.rules.map((x) => x.appliesTo), ["Posts with age limit 18–27 years", "Posts with age limit 20–30 years"]);
    assert.deepEqual(r.relaxations[0], { ...r.relaxations[0], years: 3, categories: ["OBC"], manual: false });
    assert.equal(r.relaxations[1].manual, true);
  });

  it("won't let a live photo carry sizes or a signature's quote stand in for a photo", () => {
    const r = tidy(
      "uploads",
      {
        items: [
          { kind: "photo", live: true, minKB: 10, maxKB: 20, quote: "The photograph is captured live", page: 3 },
          { kind: "photo", live: false, minKB: 10, maxKB: 20, quote: "upload the scanned signature in JPEG format (10 to 20 KB)", page: 3 },
        ],
      },
      pages,
    );
    assert.equal(r.items[0].maxKB, null);
    assert.equal(r.items[0].check.status, "verified");
    // the second "photo" only quotes the signature sentence, so it's dropped as a mislabelled copy
    assert.equal(r.items.length, 1);
  });

  it("asks again when the relaxation table went missing", () => {
    assert.equal(looksIncomplete("age", { rules: [{}], relaxations: [] }, "age relaxation table"), true);
    assert.equal(looksIncomplete("age", { rules: [{}], relaxations: [] }, "no such table"), false);
    assert.equal(looksIncomplete("basics", { exam: null, dates: [] }, ""), true);
  });
});
