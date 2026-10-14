import Link from "next/link";
import { daysBetween, formatDate, todayIST } from "@/lib/dates";

export function closingPill(closes, today = todayIST()) {
  if (!closes) return null;
  const days = daysBetween(today, closes);
  if (days < 0) return { kind: "closed", text: `Closed ${formatDate(closes)}` };
  if (days === 0) return { kind: "soon", text: "Closes today" };
  if (days <= 7) return { kind: "soon", text: `Closes in ${days} day${days === 1 ? "" : "s"}` };
  return { kind: "open", text: `Open till ${formatDate(closes)}` };
}

export default function Library({ notices }) {
  if (!notices.length) return <p className="empty">No notices yet. The first one you drop in shows up here for everyone.</p>;
  return (
    <ul className="library">
      {notices.map((n) => {
        const pill = n.status === "reading" ? { kind: "reading", text: "Reading…" } : closingPill(n.closes);
        return (
          <li key={n.id}>
            <Link href={`/n/${n.id}`}>
              <span className="lib-name">{n.name}</span>
              <span className="lib-meta">
                {[n.body, `${n.pageCount} pages`].filter(Boolean).join(" · ")}
              </span>
              <span className="lib-when">{pill && <span className={`pill ${pill.kind}`}>{pill.text}</span>}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
