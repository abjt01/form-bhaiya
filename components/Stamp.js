"use client";

import { useId, useState } from "react";

// Every fact read from a notice carries one of these: green when its quote and numbers were found
// on the page, red when they weren't. Tapping it shows the exact line.
export function Fact({ item, label, children }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const ok = item?.check?.status === "verified";
  const page = item?.check?.page || item?.page;
  return (
    <li className="fact">
      <div className="fact-row">
        <div className="fact-main">
          {label && <div className="fact-label">{label}</div>}
          <div className="fact-value">{children}</div>
        </div>
        {item?.check && (
          <button
            type="button"
            className={`stamp ${ok ? "verified" : "check"}`}
            aria-expanded={open}
            aria-controls={id}
            title={ok ? "Found in the notice. Tap to see the line." : item.check.why}
            onClick={() => setOpen((o) => !o)}
          >
            {ok ? "✓" : "?"} {page ? `p.${page}` : "check"}
          </button>
        )}
      </div>
      {open && (
        <blockquote id={id} className={`quote${ok ? "" : " check"}`}>
          “{item.quote}”
          <cite>
            {ok
              ? `Page ${page} of the notice${item.check.match === "close" ? " (matched allowing for line breaks)" : ""}.`
              : `Check this one by hand: ${item.check.why}`}
          </cite>
        </blockquote>
      )}
    </li>
  );
}
