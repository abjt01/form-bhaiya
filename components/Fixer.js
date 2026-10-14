"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { KINDS, cleanInk, containRect, cropRect, fitToRange, inkBounds, kb, targetPixels } from "@/lib/imagespec";

const MAX_SIDE = 2000;

function todayDots() {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
}

function canvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

// Rotated, and for signatures cleaned up and trimmed to the ink. Done once per change, not per frame.
function prepare(bitmap, rotate, clean, contain) {
  const turned = rotate % 180 !== 0;
  const w = turned ? bitmap.height : bitmap.width;
  const h = turned ? bitmap.width : bitmap.height;
  const c = canvas(w, h);
  const g = c.getContext("2d", { willReadFrequently: true });
  g.fillStyle = "#fff";
  g.fillRect(0, 0, w, h);
  g.translate(w / 2, h / 2);
  g.rotate((rotate * Math.PI) / 180);
  g.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
  g.setTransform(1, 0, 0, 1, 0, 0);
  if (!clean) return c;
  const img = g.getImageData(0, 0, w, h);
  cleanInk(img.data);
  g.putImageData(img, 0, 0);
  if (!contain) return c;
  const box = inkBounds(img.data, w, h);
  if (!box) return c;
  const t = canvas(box.w, box.h);
  t.getContext("2d").drawImage(c, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
  return t;
}

function render(target, src, { spec, zoom, center, stamp }) {
  const { w, h } = targetPixels(spec);
  target.width = w;
  target.height = h;
  const g = target.getContext("2d");
  g.fillStyle = "#fff";
  g.fillRect(0, 0, w, h);
  g.imageSmoothingQuality = "high";
  if (!src) return null;

  const band = stamp.on && spec.kind === "photo" ? Math.round(h * 0.17) : 0;
  const areaH = h - band;
  let rect = null;
  if (KINDS[spec.kind].fit === "cover") {
    rect = cropRect(src.width, src.height, w / areaH, zoom, center.x, center.y);
    g.drawImage(src, rect.sx, rect.sy, rect.sw, rect.sh, 0, 0, w, areaH);
  } else {
    const r = containRect(src.width, src.height, w, h);
    g.drawImage(src, r.dx, r.dy, r.dw, r.dh);
  }

  if (band) {
    g.fillStyle = "#fff";
    g.fillRect(0, areaH, w, band);
    g.fillStyle = "#000";
    g.textAlign = "center";
    g.textBaseline = "middle";
    const lines = [stamp.name.trim().toUpperCase(), stamp.date.trim()].filter(Boolean);
    const size = Math.max(8, Math.floor(band / (lines.length * 1.35)));
    g.font = `600 ${size}px system-ui, sans-serif`;
    lines.forEach((line, i) => {
      let s = size;
      while (s > 7 && g.measureText(line).width > w * 0.94) {
        s -= 1;
        g.font = `600 ${s}px system-ui, sans-serif`;
      }
      g.fillText(line, w / 2, areaH + (band / (lines.length + 1)) * (i + 1));
    });
  }
  return rect;
}

const encode = (c, q) => new Promise((resolve) => c.toBlob((blob) => resolve({ blob, size: blob?.size ?? Infinity }), "image/jpeg", q));

export default function Fixer({ initial }) {
  const [spec, setSpec] = useState(initial);
  const [bitmap, setBitmap] = useState(null);
  const [fileName, setFileName] = useState("");
  const [zoom, setZoom] = useState(1);
  const [center, setCenter] = useState({ x: 0.5, y: 0.5 });
  const [rotate, setRotate] = useState(0);
  const [clean, setClean] = useState(initial.kind !== "photo");
  const [stamp, setStamp] = useState({ on: false, name: "", date: "" });
  const [out, setOut] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const view = useRef(null);
  const src = useRef(null);
  const crop = useRef(null);
  const drag = useRef(null);

  const contain = KINDS[spec.kind].fit === "contain";
  const { w, h } = targetPixels(spec);

  useEffect(() => {
    src.current = bitmap ? prepare(bitmap, rotate, clean, contain) : null;
  }, [bitmap, rotate, clean, contain]);

  useEffect(() => {
    if (view.current) crop.current = render(view.current, src.current, { spec, zoom, center, stamp });
  }, [bitmap, rotate, clean, contain, spec, zoom, center, stamp]);

  async function load(file) {
    setError("");
    setOut(null);
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("That isn't a picture. Use a JPG or PNG from the scanner or phone.");
      return;
    }
    try {
      const raw = await createImageBitmap(file, { imageOrientation: "from-image" });
      const s = Math.min(1, MAX_SIDE / Math.max(raw.width, raw.height));
      const b = s < 1 ? await createImageBitmap(raw, { resizeWidth: Math.round(raw.width * s), resizeHeight: Math.round(raw.height * s), resizeQuality: "high" }) : raw;
      setBitmap(b);
      setFileName(file.name);
      setZoom(1);
      setCenter({ x: 0.5, y: 0.5 });
      setRotate(0);
    } catch {
      setError("That picture couldn't be opened. Try saving it as a JPG first.");
    }
  }

  function change(patch) {
    setOut(null);
    setSpec((s) => ({ ...s, ...patch, sizeGuessed: false }));
  }

  async function make() {
    if (!src.current) return;
    setBusy(true);
    setError("");
    try {
      const c = canvas(w, h);
      render(c, src.current, { spec, zoom, center, stamp });
      const res = await fitToRange((q) => encode(c, q), spec);
      if (out?.url) URL.revokeObjectURL(out.url);
      setOut({ ...res, url: URL.createObjectURL(res.blob), w, h });
    } catch {
      setError("Couldn't make the file. Try a smaller picture.");
    } finally {
      setBusy(false);
    }
  }

  function onPointerDown(e) {
    if (contain || !crop.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, center, rect: crop.current, width: e.currentTarget.clientWidth };
  }
  function onPointerMove(e) {
    const d = drag.current;
    if (!d || !src.current) return;
    const per = d.rect.sw / d.width; // source pixels per screen pixel
    setOut(null);
    setCenter({
      x: Math.min(1, Math.max(0, d.center.x - ((e.clientX - d.x) * per) / src.current.width)),
      y: Math.min(1, Math.max(0, d.center.y - ((e.clientY - d.y) * per) / src.current.height)),
    });
  }
  const onPointerUp = () => (drag.current = null);

  const num = (v) => (v === "" ? null : Number(v));
  const kbOk = out && (!spec.maxKB || out.size <= spec.maxKB * 1024) && (!spec.minKB || out.size >= spec.minKB * 1024);
  const base = `${spec.kind}-${w}x${h}`;

  return (
    <div className="fixer">
      <div>
        <section className="card">
          <h2>
            What the notice asks for {initial.fromNotice && <small>filled in from the notice</small>}
          </h2>
          <div className="seg" role="group" aria-label="Kind of picture">
            {Object.entries(KINDS).map(([k, v]) => (
              <label key={k}>
                <input
                  type="radio"
                  name="kind"
                  checked={spec.kind === k}
                  onChange={() => {
                    setClean(k !== "photo");
                    change({ kind: k, label: v.label, widthCm: spec.widthPx ? spec.widthCm : v.widthCm, heightCm: spec.widthPx ? spec.heightCm : v.heightCm });
                  }}
                />
                <span>{v.label}</span>
              </label>
            ))}
          </div>
          <div className="grid2" style={{ marginTop: 12 }}>
            <label>
              Smallest file (KB)
              <input type="number" min="0" inputMode="decimal" value={spec.minKB ?? ""} onChange={(e) => change({ minKB: num(e.target.value) })} />
            </label>
            <label>
              Largest file (KB)
              <input type="number" min="0" inputMode="decimal" value={spec.maxKB ?? ""} onChange={(e) => change({ maxKB: num(e.target.value) })} />
            </label>
          </div>
          {spec.widthPx ? (
            <div className="grid2">
              <label>
                Width (pixels)
                <input type="number" min="10" value={spec.widthPx} onChange={(e) => change({ widthPx: num(e.target.value) || null })} />
              </label>
              <label>
                Height (pixels)
                <input type="number" min="10" value={spec.heightPx ?? ""} onChange={(e) => change({ heightPx: num(e.target.value) || null })} />
              </label>
            </div>
          ) : (
            <div className="grid2">
              <label>
                Width (cm)
                <input type="number" min="0.5" step="0.1" value={spec.widthCm ?? ""} onChange={(e) => change({ widthCm: num(e.target.value) || 1 })} />
              </label>
              <label>
                Height (cm)
                <input type="number" min="0.5" step="0.1" value={spec.heightCm ?? ""} onChange={(e) => change({ heightCm: num(e.target.value) || 1 })} />
              </label>
            </div>
          )}
          <p className="muted small">
            The file will be <span className="num">{w}×{h}</span> pixels
            {spec.widthPx ? "." : ` (${spec.widthCm}×${spec.heightCm} cm at ${spec.dpi} dpi).`}{" "}
            {spec.sizeGuessed && "That's a common size, not one from a notice: change it to what yours says."}
          </p>
        </section>

        <section className="card">
          <h2>The picture</h2>
          <label className="drop" style={{ minHeight: 110 }}>
            <input type="file" accept="image/*" aria-label="Picture" onChange={(e) => load(e.target.files?.[0])} />
            <strong>{fileName ? `Using ${fileName}` : "Choose the scan or phone photo"}</strong>
            <span className="muted small">JPG or PNG. It stays on this computer.</span>
          </label>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {bitmap && (
            <>
              {!contain && (
                <label style={{ marginTop: 12 }}>
                  Zoom
                  <input type="range" min="1" max="3" step="0.01" value={zoom} onChange={(e) => (setOut(null), setZoom(Number(e.target.value)))} />
                  <span className="hint">Drag the picture to move it inside the frame.</span>
                </label>
              )}
              <label className="check-row">
                <input type="checkbox" checked={clean} onChange={(e) => (setOut(null), setClean(e.target.checked))} />
                {contain ? "Clean the paper to white and trim to the ink" : "Clean the background to white (for scans)"}
              </label>
              {spec.kind === "photo" && (
                <>
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={stamp.on}
                      onChange={(e) => (setOut(null), setStamp({ ...stamp, on: e.target.checked, date: stamp.date || todayDots() }))}
                    />
                    Print name and date under the photo
                  </label>
                  {stamp.on && (
                    <div className="grid2">
                      <label>
                        Name
                        <input type="text" maxLength={40} value={stamp.name} onChange={(e) => (setOut(null), setStamp({ ...stamp, name: e.target.value }))} />
                      </label>
                      <label>
                        Date of photo
                        <input type="text" maxLength={12} value={stamp.date} onChange={(e) => (setOut(null), setStamp({ ...stamp, date: e.target.value }))} />
                      </label>
                    </div>
                  )}
                </>
              )}
              <div className="btn-row">
                <button className="btn ghost small" type="button" onClick={() => (setOut(null), setRotate((r) => (r + 90) % 360))}>
                  Turn 90°
                </button>
              </div>
            </>
          )}
        </section>
      </div>

      <div>
        <section className="card">
          <h2>Preview</h2>
          <div className="stage">
            <canvas
              ref={view}
              aria-label="Preview of the file"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              style={{ width: Math.min(360, w * (h > w ? 1.2 : 1)) }}
            />
          </div>
          <div className="btn-row">
            <button className="btn" type="button" disabled={!bitmap || busy} onClick={make}>
              {busy ? "Making…" : "Make the file"}
            </button>
          </div>
          {out && (
            <div style={{ marginTop: 14 }} aria-live="polite">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="out-img" src={out.url} alt={`The finished ${spec.kind}`} width={out.w} height={out.h} style={{ width: Math.min(360, out.w) }} />
              <ul className="checks">
                <li>
                  <span className="ok">✓</span> JPG, <span className="num">{out.w}×{out.h}</span> pixels
                </li>
                <li data-testid="kb">
                  <span className={kbOk ? "ok" : "bad"}>{kbOk ? "✓" : "✗"}</span> <span className="num">{kb(out.size)} KB</span>
                  {spec.minKB || spec.maxKB ? ` (needs ${spec.minKB ?? 0}–${spec.maxKB ?? "any"} KB)` : ""}
                  {out.why === "small" && " · too small even at full quality: scan it at a higher resolution or with more of the picture"}
                  {out.why === "big" && " · still too big at the lowest quality: make the pixel size smaller"}
                </li>
              </ul>
              <a className="btn" href={out.url} download={`${base}-${Math.round(kb(out.size))}kb.jpg`}>
                Download
              </a>
            </div>
          )}
          <p className="private">
            <span aria-hidden="true">🔒</span>
            <span>Pictures are processed in this browser and never uploaded.</span>
          </p>
        </section>
        {initial.fromNotice && (
          <p className="small">
            <Link href={`/n/${initial.notice}`}>← Back to the notice</Link>
          </p>
        )}
      </div>
    </div>
  );
}
