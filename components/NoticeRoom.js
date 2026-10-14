"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { daysBetween, formatDate, todayIST, weekday } from "@/lib/dates";
import { api } from "./api";
import Candidate from "./Candidate";
import { Fact } from "./Stamp";

const rupees = (n) => (n === 0 ? "No fee" : `₹${n.toLocaleString("en-IN")}`);

function countdown(date, kind) {
  const days = daysBetween(todayIST(), date);
  if (kind !== "apply_end" && kind !== "fee_end" && kind !== "correction_end") {
    if (days < 0) return null;
    return days === 0 ? { kind: "soon", text: "Today" } : { kind: "open", text: `In ${days} day${days === 1 ? "" : "s"}` };
  }
  if (days < 0) return { kind: "closed", text: "Closed" };
  if (days === 0) return { kind: "soon", text: "Today" };
  return { kind: days <= 7 ? "soon" : "open", text: `${days} day${days === 1 ? "" : "s"} left` };
}

function tally(read) {
  const items = [];
  const b = read.basics || {};
  // only what has a stamp on the page, so the count matches what the café can tap
  items.push(b.website, ...(b.dates || []), ...(b.fees || []));
  items.push(...(read.age?.rules || []), ...(read.age?.relaxations || []));
  items.push(...(read.uploads?.items || []), ...(read.education?.items || []), read.education?.finalYear, ...(read.documents?.items || []));
  const real = items.filter((x) => x?.check);
  return { total: real.length, ok: real.filter((x) => x.check.status === "verified").length };
}

function sizeText(u) {
  const out = [];
  if (u.format) out.push(u.format.toUpperCase());
  if (u.minKB != null || u.maxKB != null) out.push(u.minKB != null && u.maxKB != null ? `${u.minKB}–${u.maxKB} KB` : u.maxKB != null ? `up to ${u.maxKB} KB` : `at least ${u.minKB} KB`);
  if (u.widthPx && u.heightPx) out.push(`${u.widthPx}×${u.heightPx} px`);
  if (u.widthCm && u.heightCm) out.push(`${u.widthCm}×${u.heightCm} cm`);
  return out;
}

export function fixLink(u, noticeId) {
  const q = new URLSearchParams({ kind: u.kind === "other" ? "photo" : u.kind, n: noticeId });
  for (const [k, v] of [
    ["min", u.minKB],
    ["max", u.maxKB],
    ["wpx", u.widthPx],
    ["hpx", u.heightPx],
    ["wcm", u.widthCm],
    ["hcm", u.heightCm],
  ]) {
    if (v != null) q.set(k, String(v));
  }
  if (u.label) q.set("label", u.label);
  return `/fix?${q}`;
}

export default function NoticeRoom({ initial }) {
  const [n, setN] = useState(initial);
  const [error, setError] = useState("");
  const reading = n.status === "reading";

  useEffect(() => {
    if (!reading) return;
    let stop = false;
    const tick = async () => {
      try {
        const next = await api("GET", `/api/notices/${n.id}`);
        if (!stop) setN(next);
      } catch {}
    };
    const t = setInterval(tick, 2500);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [reading, n.id]);

  async function retry() {
    setError("");
    try {
      await api("POST", `/api/notices/${n.id}/retry`);
      setN({ ...n, status: "reading", jobs: Object.fromEntries(Object.entries(n.jobs).map(([k, j]) => [k, j.status === "done" ? j : { ...j, status: "waiting" }])) });
    } catch (err) {
      setError(err.message);
    }
  }

  const r = n.read || {};
  const b = r.basics;
  const t = tally(r);
  const failed = Object.values(n.jobs || {}).some((j) => j.status === "failed");

  return (
    <main className="wrap">
      <header className="notice-head">
        <p className="eyebrow">{b?.exam?.body || "Exam notice"}</p>
        <h1>{b?.exam?.name || n.fileName}</h1>
        <p className="meta">
          {n.fileName} · {n.pageCount} pages{n.seeded ? " · read ahead of time" : ""}
        </p>
        {t.total > 0 && (
          <div className="tally">
            <span className="pill open">
              {t.ok} of {t.total} answers found word for word in the notice
            </span>
            {t.total > t.ok && <span className="pill soon">{t.total - t.ok} to check by hand</span>}
            <a className="jump" href="#candidate">
              Check a candidate ↓
            </a>
          </div>
        )}
      </header>

      {(reading || failed || n.status === "failed") && (
        <section className="card" aria-live="polite">
          <h2>{reading ? "Reading the notice" : "Some parts weren't read"}</h2>
          {reading && (
            <p className="muted small">
              Five questions, three open models working side by side. The free tier lets each model read about a page of excerpts a
              minute, so this takes a minute or two, once. After that the notice opens instantly for everyone.
            </p>
          )}
          {n.error && <p className="error">{n.error}</p>}
          <ul className="jobs">
            {Object.entries(n.jobs || {}).map(([k, j]) => (
              <li key={k}>
                <span className="state" aria-hidden="true">
                  {j.status === "done" ? "✓" : j.status === "failed" ? "✗" : j.status === "reading" ? <span className="spin" /> : "·"}
                </span>
                <span>
                  {j.label}
                  <span className="muted small"> {j.status === "waiting" ? "(waiting for its turn)" : j.status === "failed" ? `(${j.error})` : ""}</span>
                </span>
                <span className="model">{String(j.model).replace(/^.*\//, "")}</span>
              </li>
            ))}
          </ul>
          {!reading && failed && (
            <div className="btn-row">
              <button className="btn" type="button" onClick={retry}>
                Read the missing parts again
              </button>
            </div>
          )}
          {error && <p className="error">{error}</p>}
        </section>
      )}

      <div className="layout">
        <div>
          {b && (
            <section className="card">
              <h2>Dates</h2>
              {b.dates.length ? (
                <ul className="facts">
                  {[...b.dates]
                    .sort((x, y) => (x.date < y.date ? -1 : 1))
                    .map((d, i) => {
                      const c = countdown(d.date, d.kind);
                      return (
                        <Fact key={i} item={d} label={d.what}>
                          <span className="num">
                            {weekday(d.date)} {formatDate(d.date)}
                            {d.time ? `, ${d.time}` : ""}
                          </span>{" "}
                          {c && <span className={`pill ${c.kind}`}>{c.text}</span>}
                        </Fact>
                      );
                    })}
                </ul>
              ) : (
                <p className="empty">No dates were found in the notice.</p>
              )}
              {b.website && (
                <ul className="facts">
                  <Fact item={b.website} label="Apply at">
                    <a href={/^https?:\/\//.test(b.website.url) ? b.website.url : `https://${b.website.url}`} target="_blank" rel="noreferrer">
                      {b.website.url}
                    </a>
                  </Fact>
                </ul>
              )}
            </section>
          )}

          {b && (
            <section className="card">
              <h2>Fee</h2>
              {b.fees.length ? (
                <ul className="facts">
                  {b.fees.map((f, i) => (
                    <Fact key={i} item={f} label={f.label}>
                      <span className="num">{rupees(f.amount)}</span>
                    </Fact>
                  ))}
                </ul>
              ) : (
                <p className="empty">The fee wasn&apos;t found in the notice.</p>
              )}
            </section>
          )}

          {r.age && (
            <section className="card">
              <h2>Age limits</h2>
              <ul className="facts">
                {r.age.rules.map((a, i) => (
                  <Fact key={i} item={a} label={a.appliesTo}>
                    {a.bornFrom && a.bornTo ? (
                      <>
                        Born between <span className="num">{formatDate(a.bornFrom)}</span> and <span className="num">{formatDate(a.bornTo)}</span>
                      </>
                    ) : (
                      <>
                        {a.minAge}–{a.maxAge} years on <span className="num">{formatDate(a.asOn)}</span>
                      </>
                    )}
                    {a.sex && <span className="muted"> · {a.sex === "male" ? "men only" : "women only"}</span>}
                    {a.notes && <div className="muted small">{a.notes}</div>}
                  </Fact>
                ))}
              </ul>
              {r.age.relaxations.length > 0 && (
                <>
                  <h3 style={{ marginTop: 14 }}>Relaxation of the upper age limit</h3>
                  <ul className="facts">
                    {r.age.relaxations.map((x, i) => (
                      <Fact key={i} item={x} label={x.label}>
                        {x.years != null ? `${x.years} years` : "See the notice"}
                        {x.manual && <span className="muted small"> · worked out by hand</span>}
                      </Fact>
                    ))}
                  </ul>
                </>
              )}
            </section>
          )}

          {r.uploads && (
            <section className="card">
              <h2>Photo and signature</h2>
              {r.uploads.items.length ? (
                <ul className="facts">
                  {r.uploads.items.map((u, i) => (
                    <Fact key={i} item={u} label={u.label}>
                      {u.live ? (
                        <span>Taken live with a webcam while filling the form. Nothing to upload.</span>
                      ) : sizeText(u).length ? (
                        <div className="specs">
                          {sizeText(u).map((s) => (
                            <span className="spec" key={s}>
                              {s}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="muted">No size given here.</span>
                      )}
                      {u.notes && <div className="muted small">{u.notes}</div>}
                      {!u.live && ["photo", "signature", "thumb", "declaration"].includes(u.kind) && sizeText(u).length > 0 && (
                        <Link className="btn ghost small" href={fixLink(u, n.id)} style={{ marginTop: 6 }}>
                          Fix one to this size
                        </Link>
                      )}
                    </Fact>
                  ))}
                </ul>
              ) : (
                <p className="empty">The notice doesn&apos;t give photo or signature sizes.</p>
              )}
            </section>
          )}

          {r.education && (
            <section className="card">
              <h2>Who can apply</h2>
              <ul className="facts">
                {r.education.items.map((e, i) => (
                  <Fact key={i} item={e} label={e.appliesTo}>
                    {e.requirement}
                  </Fact>
                ))}
                {r.education.finalYear && (
                  <Fact item={r.education.finalYear} label="Final-year students">
                    {r.education.finalYear.detail}
                  </Fact>
                )}
              </ul>
            </section>
          )}

          {r.documents && (
            <section className="card">
              <h2>Documents</h2>
              {r.documents.items.length ? (
                <ul className="facts">
                  {r.documents.items.map((d, i) => (
                    <Fact key={i} item={d} label={{ apply: "While applying", exam_day: "On exam day", verification: "At document verification" }[d.when]}>
                      {d.name}
                    </Fact>
                  ))}
                </ul>
              ) : (
                <p className="empty">No document list was found.</p>
              )}
            </section>
          )}
        </div>

        <aside className="side">
          <Candidate notice={n} />
        </aside>
      </div>
    </main>
  );
}
