"use client";

import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { api } from "./api";

const noop = () => () => {};

export default function Upload() {
  const router = useRouter();
  const ready = useSyncExternalStore(noop, () => true, () => false);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [error, setError] = useState("");

  async function send(file) {
    if (!file) return;
    setError("");
    if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") {
      setError("That isn't a PDF. Download the notice PDF from the exam's official site and drop it here.");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setError("That PDF is bigger than 20 MB.");
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.append("pdf", file);
      const { id } = await api("POST", "/api/notices", form);
      router.push(`/n/${id}`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div data-ready={ready ? "" : undefined}>
      <label
        className={`drop${over ? " over" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          send(e.dataTransfer.files?.[0]);
        }}
      >
        <input type="file" accept="application/pdf,.pdf" disabled={!ready || busy} aria-label="Notice PDF" onChange={(e) => send(e.target.files?.[0])} />
        {busy ? (
          <>
            <span className="spin" aria-hidden="true" />
            <strong>Opening the PDF…</strong>
          </>
        ) : (
          <>
            <strong>Drop the notice PDF here</strong>
            <span className="muted small">or tap to choose it. Up to 20 MB, any length.</span>
          </>
        )}
      </label>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
