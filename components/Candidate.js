"use client";

import { useState } from "react";
import { formatDate, parseTypedDate } from "@/lib/dates";
import { CATEGORIES, CATEGORY_NAMES, checkAge, feeFor, normaliseCandidate } from "@/lib/eligibility";
import { api, readLocal, writeLocal } from "./api";

const VERDICT = { yes: "Eligible", no: "Not eligible", maybe: "Check by hand", unknown: "Can't tell" };

const HI = {
  title: "आवेदन पर्ची",
  candidate: "उम्मीदवार",
  eligible: "आयु के अनुसार पात्र",
  notEligible: "आयु के अनुसार पात्र नहीं",
  check: "हाथ से जाँचें",
  fee: "फ़ीस",
  noFee: "कोई फ़ीस नहीं",
  dates: "ज़रूरी तारीख़ें",
  docs: "ये कागज़ तैयार रखें",
  filledAt: "फ़ॉर्म भरा गया",
  confirm: "आख़िरी फ़ैसला सरकारी नोटिस से ही मिलाएँ।",
};
const EN = {
  title: "Application slip",
  candidate: "Candidate",
  eligible: "Eligible by age for",
  notEligible: "Not eligible by age",
  check: "Check by hand",
  fee: "Fee",
  noFee: "No fee",
  dates: "Dates to remember",
  docs: "Keep these ready",
  filledAt: "Form filled at",
  confirm: "Always confirm against the official notice.",
};

const ONLY_DIGITS = (s) => s.replace(/[^\d]/g, "");

export default function Candidate({ notice }) {
  const r = notice.read || {};
  const [dobText, setDobText] = useState("");
  const [c, setC] = useState({ category: "GEN", sex: "male", pwbd: false, esm: false });
  const [slip, setSlip] = useState(false);
  const [lang, setLang] = useState("hi");
  const [name, setName] = useState("");
  const [cafe, setCafe] = useState(() => (typeof window === "undefined" ? "" : readLocal("fb-cafe")));
  const [hi, setHi] = useState(null);
  const [copied, setCopied] = useState(false);

  const dob = parseTypedDate(dobText);
  const cand = normaliseCandidate({ ...c, dob: dob || "" });
  const rules = r.age?.rules || [];
  const ages = rules.map((rule) => ({ rule, res: checkAge(rule, cand, r.age?.relaxations || []) }));
  const fee = feeFor(r.basics?.fees || [], cand);
  const ready = Boolean(dob);

  async function openSlip() {
    setSlip(true);
    if (hi === null && notice.status !== "reading") {
      try {
        const data = await api("POST", `/api/notices/${notice.id}/hindi`);
        setHi(data.hi || {});
      } catch {
        setHi({});
      }
    }
  }

  const L = lang === "hi" ? HI : EN;
  const t = (s) => (lang === "hi" && hi?.[s]) || s;
  const yes = ages.filter((a) => a.res.status === "yes");
  const dates = (r.basics?.dates || []).filter((d) => ["apply_end", "fee_end", "correction_start", "correction_end", "exam"].includes(d.kind));
  const docs = (r.documents?.items || []).slice(0, 10);

  function slipText() {
    const lines = [`${L.title}: ${r.basics?.exam?.name || notice.fileName}`];
    if (name) lines.push(`${L.candidate}: ${name}`);
    if (yes.length) lines.push(`${L.eligible}: ${yes.map((a) => a.rule.appliesTo).join(", ")}`);
    else lines.push(L.notEligible);
    if (fee) lines.push(`${L.fee}: ${fee.amount === 0 ? L.noFee : `₹${fee.amount}`}`);
    if (dates.length) {
      lines.push("", `${L.dates}:`);
      for (const d of dates) lines.push(`• ${t(d.what)}: ${formatDate(d.date, lang)}${d.time ? `, ${d.time}` : ""}`);
    }
    if (docs.length) {
      lines.push("", `${L.docs}:`);
      for (const d of docs) lines.push(`• ${t(d.name)}`);
    }
    if (cafe) lines.push("", `${L.filledAt}: ${cafe}`);
    lines.push(L.confirm);
    return lines.join("\n");
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(slipText());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }

  return (
    <section className="card">
      <h2>Candidate at the counter</h2>
      {!rules.length && !r.basics?.fees?.length ? (
        <p className="muted">{notice.status === "reading" ? "This opens up as soon as the age limits and fees are read." : "The notice's age limits and fees weren't found, so there's nothing to check against."}</p>
      ) : (
        <form onSubmit={(e) => e.preventDefault()} aria-label="Candidate details">
          <label>
            Date of birth
            <input
              type="text"
              inputMode="numeric"
              placeholder="DD.MM.YYYY"
              autoComplete="off"
              value={dobText}
              onChange={(e) => setDobText(e.target.value)}
              onBlur={() => {
                const digits = ONLY_DIGITS(dobText);
                if (!dob && digits.length === 8) setDobText(`${digits.slice(0, 2)}.${digits.slice(2, 4)}.${digits.slice(4)}`);
              }}
            />
            <span className="hint">{dobText && !dob ? "Type it as 14.03.2004" : dob ? formatDate(dob) : "As on the Class 10 certificate."}</span>
          </label>
          <div className="grid2">
            <label>
              Category
              <select value={c.category} onChange={(e) => setC({ ...c, category: e.target.value })}>
                {CATEGORIES.map((k) => (
                  <option key={k} value={k}>
                    {CATEGORY_NAMES[k]}
                  </option>
                ))}
              </select>
            </label>
            <fieldset style={{ border: 0, padding: 0, margin: "0 0 12px" }}>
              <legend style={{ fontWeight: 600, fontSize: "0.95rem" }}>Sex</legend>
              <div className="seg">
                {[
                  ["male", "Male"],
                  ["female", "Female"],
                  ["other", "Other"],
                ].map(([v, l]) => (
                  <label key={v}>
                    <input type="radio" name="sex" value={v} checked={c.sex === v} onChange={() => setC({ ...c, sex: v })} />
                    <span>{l}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
          <label className="check-row">
            <input type="checkbox" checked={c.pwbd} onChange={(e) => setC({ ...c, pwbd: e.target.checked })} />
            Person with benchmark disability (PwBD)
          </label>
          <label className="check-row">
            <input type="checkbox" checked={c.esm} onChange={(e) => setC({ ...c, esm: e.target.checked })} />
            Ex-serviceman
          </label>
        </form>
      )}

      {ready && (
        <div aria-live="polite">
          {fee && (
            <p className="fee-line">
              {fee.amount === 0 ? "No fee" : `Pays ₹${fee.amount.toLocaleString("en-IN")}`}
              <span className="muted small"> ({fee.label})</span>
            </p>
          )}
          {ages.map(({ rule, res }, i) => (
            <div key={i} className={`result ${res.status}`}>
              <strong>
                <span className="verdict">{VERDICT[res.status]}</span> · {rule.appliesTo}
              </strong>
              <span className="small">{res.why}</span>
              {res.window && (
                <span className="small muted" style={{ display: "block" }}>
                  Allowed: born {formatDate(res.from || res.window.from)} to {formatDate(res.window.to)}
                  {res.window.derived ? " (worked out from the age range, check the notice)" : ""}
                </span>
              )}
              {res.manual?.length > 0 && (
                <span className="small" style={{ display: "block" }}>
                  Also check by hand: {res.manual.map((m) => m.label).join("; ")}
                </span>
              )}
            </div>
          ))}
          <div className="btn-row">
            <button className="btn" type="button" onClick={openSlip}>
              Make a slip for the candidate
            </button>
          </div>
        </div>
      )}

      <p className="private">
        <span aria-hidden="true">🔒</span>
        <span>The candidate&apos;s details stay in this browser. Nothing here is sent to the server.</span>
      </p>

      {slip && ready && (
        <div className="slip-wrap">
          <div className="seg no-print" style={{ marginTop: 12 }} role="group" aria-label="Slip language">
            {[
              ["hi", "हिंदी"],
              ["en", "English"],
            ].map(([v, l]) => (
              <label key={v}>
                <input type="radio" name="lang" value={v} checked={lang === v} onChange={() => setLang(v)} />
                <span>{l}</span>
              </label>
            ))}
          </div>
          <div className="grid2 no-print" style={{ marginTop: 10 }}>
            <label>
              Candidate&apos;s name <span className="hint">Optional, only printed on the slip</span>
              <input type="text" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
            </label>
            <label>
              Your café&apos;s name <span className="hint">Remembered on this computer</span>
              <input
                type="text"
                value={cafe}
                maxLength={60}
                onChange={(e) => {
                  setCafe(e.target.value);
                  writeLocal("fb-cafe", e.target.value);
                }}
              />
            </label>
          </div>
          <div className="slip" lang={lang}>
            <h3>{r.basics?.exam?.name || notice.fileName}</h3>
            <dl>
              {name && (
                <>
                  <dt>{L.candidate}</dt>
                  <dd>{name}</dd>
                </>
              )}
              <dt>{yes.length ? L.eligible : L.notEligible}</dt>
              <dd>{yes.length ? yes.map((a) => a.rule.appliesTo).join(", ") : "—"}</dd>
              {fee && (
                <>
                  <dt>{L.fee}</dt>
                  <dd className="num">{fee.amount === 0 ? L.noFee : `₹${fee.amount.toLocaleString("en-IN")}`}</dd>
                </>
              )}
            </dl>
            {dates.length > 0 && (
              <>
                <strong>{L.dates}</strong>
                <ul>
                  {dates.map((d, i) => (
                    <li key={i}>
                      {t(d.what)}: <span className="num">{formatDate(d.date, lang)}</span>
                      {d.time ? `, ${d.time}` : ""}
                    </li>
                  ))}
                </ul>
              </>
            )}
            {docs.length > 0 && (
              <>
                <strong>{L.docs}</strong>
                <ul>
                  {docs.map((d, i) => (
                    <li key={i}>{t(d.name)}</li>
                  ))}
                </ul>
              </>
            )}
            {cafe && (
              <p className="small">
                {L.filledAt}: {cafe}
              </p>
            )}
            <p className="small muted">{L.confirm}</p>
          </div>
          <div className="btn-row no-print">
            <button className="btn ghost small" type="button" onClick={() => window.print()}>
              Print
            </button>
            <button className="btn ghost small" type="button" onClick={copy}>
              {copied ? "Copied" : "Copy text"}
            </button>
            <a className="btn ghost small" href={`https://wa.me/?text=${encodeURIComponent(slipText())}`} target="_blank" rel="noreferrer">
              Send on WhatsApp
            </a>
          </div>
        </div>
      )}
    </section>
  );
}
