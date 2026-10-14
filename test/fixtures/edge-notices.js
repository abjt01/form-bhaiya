// Notices built to stress the layout: the longest names the models have produced and then some,
// red "check" stamps, Devanagari, and one still being read.
const v = (page) => ({ status: "verified", page, match: "exact" });
const bad = (page) => ({ status: "check", why: "The number 60 isn't on page 3.", page });
const long = "Combined Graduate Level and Multi-Tasking (Non-Technical) Staff and Havaldar (CBIC & CBN) Examination, 2026 (संयुक्त स्नातक स्तरीय परीक्षा)";

export const EDGE_NOTICES = {
  edge: {
    id: "edge",
    sha: "edge",
    fileName: "Notice_of_adv_combined_graduate_level_and_multi_tasking_staff_examination_2026_final_revised.pdf",
    pageCount: 288,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    status: "done",
    models: { mock: true },
    jobs: {},
    hi: null,
    read: {
      basics: {
        exam: { name: long, body: "Staff Selection Commission, Department of Personnel and Training, Government of India", quote: "x", page: 1, check: v(1) },
        website: { url: "https://ssc.gov.in/candidate-portal/one-time-registration/application/very/long/path", quote: "x", page: 1, check: v(1) },
        dates: [
          { what: "Online applications open", kind: "apply_start", date: "2026-09-07", time: null, quote: "x", page: 1, check: v(1) },
          { what: "Last date and time for receipt of online applications including fee payment and correction", kind: "apply_end", date: "2099-10-07", time: "23:00", quote: "x", page: 1, check: v(1) },
          { what: "Correction window", kind: "correction_end", date: "2026-10-16", time: "23:00", quote: "x", page: 1, check: bad(1) },
          { what: "Computer Based Examination (Tier-I)", kind: "exam", date: "2099-12-01", time: null, quote: "x", page: 1, check: v(1) },
        ],
        fees: [
          { label: "Everyone else", amount: 100000, categories: [], pwbd: null, esm: null, women: null, quote: "x", page: 2, check: v(2) },
          { label: "Women, SC, ST, PwBD and Ex-servicemen eligible for reservation", amount: 0, categories: ["SC", "ST"], pwbd: null, esm: null, women: null, quote: "x", page: 2, check: v(2) },
        ],
      },
      age: {
        rules: [
          { appliesTo: "Assistant Audit Officer / Assistant Accounts Officer (Indian Audit and Accounts Department)", sex: null, bornFrom: "1994-08-02", bornTo: "2008-08-01", minAge: 18, maxAge: 32, asOn: "2026-08-01", notes: "Unmarried; widows and divorced women who have not remarried can also apply", quote: "x", page: 6, check: v(6) },
          { appliesTo: "Posts with age limit 18–30 years", sex: "male", bornFrom: null, bornTo: null, minAge: 18, maxAge: 30, asOn: "2026-08-01", notes: null, quote: "x", page: 6, check: bad(6) },
        ],
        relaxations: [
          { label: "Central Government Civilian Employees (SC/ST) who have rendered not less than 3 years regular and continuous service", years: null, categories: ["SC", "ST"], pwbd: null, esm: null, women: null, manual: true, quote: "x", page: 7, check: v(7) },
          { label: "OBC", years: 3, categories: ["OBC"], pwbd: null, esm: null, women: null, manual: false, quote: "x", page: 7, check: v(7) },
        ],
      },
      uploads: {
        items: [
          { kind: "photo", label: "Live photograph", live: true, format: null, minKB: null, maxKB: null, widthPx: null, heightPx: null, widthCm: null, heightCm: null, notes: "No cap, mask or glasses; plain background; face fully inside the frame shown by the camera", quote: "x", page: 18, check: v(18) },
          { kind: "signature", label: "Scanned signature", live: false, format: "JPEG/JPG", minKB: 10, maxKB: 20, widthPx: 1400, heightPx: 600, widthCm: 6, heightCm: 2, notes: null, quote: "x", page: 18, check: v(18) },
          { kind: "thumb", label: "Left thumb impression", live: false, format: "JPG", minKB: 20, maxKB: 60, widthPx: null, heightPx: null, widthCm: null, heightCm: null, notes: null, quote: "Candidates must upload their left thumb impression in JPG format, 20 KB to 50 KB.", page: 3, check: bad(3) },
        ],
      },
      education: {
        items: [{ appliesTo: "Junior Statistical Officer (JSO)", requirement: "Bachelor's Degree in any subject from a recognised University with at least 60% marks in Mathematics at 12th standard level; or Bachelor's Degree with Statistics as one of the subjects", quote: "x", page: 14, check: v(14) }],
        finalYear: { allowed: true, detail: "Final-year students can apply if the result is declared by the cut-off date.", quote: "x", page: 14, check: v(14) },
      },
      documents: {
        items: [
          { name: "Income & Asset certificate (EWS) in the format given at Annexure-XIV, issued by the competent authority", when: "verification", quote: "x", page: 11, check: v(11) },
          { name: "आधार कार्ड", when: "exam_day", quote: "x", page: 37, check: v(37) },
        ],
      },
    },
  },
  reading: {
    id: "reading",
    sha: "reading",
    fileName: "notice_being_read_right_now_with_a_rather_long_name.pdf",
    pageCount: 132,
    createdAt: "2026-10-02T00:00:00.000Z",
    updatedAt: "2999-01-01T00:00:00.000Z",
    status: "reading",
    models: { mock: false },
    jobs: {
      basics: { status: "done", label: "Exam, dates and fees", model: "openai/gpt-oss-120b" },
      age: { status: "reading", label: "Age limits and relaxations", model: "openai/gpt-oss-120b" },
      uploads: { status: "failed", label: "Photo and signature", model: "openai/gpt-oss-20b", error: "The model didn't answer in time." },
      education: { status: "waiting", label: "Who can apply", model: "qwen/qwen3.8-27b" },
      documents: { status: "waiting", label: "Documents to bring", model: "openai/gpt-oss-20b" },
    },
    read: {
      basics: {
        exam: { name: "Junior Engineer (Civil, Mechanical, Electrical) Examination, 2026", body: "Staff Selection Commission", quote: "x", page: 1, check: v(1) },
        website: null,
        dates: [{ what: "Online applications close", kind: "apply_end", date: "2099-10-07", time: "23:00", quote: "x", page: 1, check: v(1) }],
        fees: [],
      },
    },
    hi: null,
  },
};
