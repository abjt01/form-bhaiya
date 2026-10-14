import Link from "next/link";
import Library from "@/components/Library";
import Upload from "@/components/Upload";
import { listNotices } from "@/lib/notices";

export const dynamic = "force-dynamic";

export default async function Home() {
  const notices = await listNotices();
  const closed = notices.filter((n) => n.open === false && n.status !== "reading");
  const open = notices.filter((n) => !closed.includes(n));
  return (
    <main className="wrap">
      <section className="hero">
        <p className="eyebrow">For cyber cafés that fill sarkari forms</p>
        <h1>Read the notice before the queue does.</h1>
        <p className="lede">
          Drop in an exam notice PDF. Form Bhaiya reads it once (dates, fees, age limits, photo and signature sizes) and shows the
          line in the notice behind every answer. Then check each candidate in seconds, and fix their photo and signature to size
          right here in the browser.
        </p>
      </section>

      <div className="layout">
        <div>
          <section className="card">
            <h2>Read a new notice</h2>
            <Upload />
            <p className="muted small" style={{ marginTop: 10 }}>
              The first read takes about a minute. After that it&apos;s instant for every café, because a notice only has to be read once.
            </p>
          </section>

          <section className="card" id="notices">
            <h2>
              Notices already read <small>{notices.length ? `${notices.length} so far` : ""}</small>
            </h2>
            <Library notices={open} />
            {closed.length > 0 && (
              <>
                <h3 style={{ marginTop: 18 }}>Closed</h3>
                <Library notices={closed} />
              </>
            )}
          </section>
        </div>

        <aside className="side">
          <section className="card">
            <h2>At the counter</h2>
            <ol className="steps">
              <li>
                <strong>Open the notice</strong>
                Last date, fee, who can apply. Tap any stamp to see the exact line and page it came from.
              </li>
              <li>
                <strong>Check the candidate</strong>
                Date of birth and category in, an answer out, with the relaxation worked out to the day.
              </li>
              <li>
                <strong>Fix the photo and signature</strong>
                Cropped, resized and squeezed into the notice&apos;s KB range without leaving this computer.
              </li>
            </ol>
            <div className="btn-row">
              <Link className="btn ghost" href="/fix">
                Fix a photo or signature
              </Link>
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}
