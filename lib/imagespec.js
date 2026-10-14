// The arithmetic behind fixing a photo or signature to a notice's rules. The canvas work happens
// in the browser; these functions are plain so they can be tested without one.

export const KINDS = {
  photo: { label: "Photograph", widthCm: 3.5, heightCm: 4.5, fit: "cover" },
  signature: { label: "Signature", widthCm: 6, heightCm: 2, fit: "contain" },
  thumb: { label: "Thumb impression", widthCm: 3, heightCm: 3, fit: "contain" },
  declaration: { label: "Handwritten declaration", widthCm: 10, heightCm: 5, fit: "contain" },
};

const pos = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

// From the query string the notice page links with, or the form on the fixer page.
export function readSpec(q = {}) {
  const kind = KINDS[q.kind] ? q.kind : "photo";
  const spec = {
    kind,
    label: typeof q.label === "string" && q.label.trim() ? q.label.trim().slice(0, 60) : KINDS[kind].label,
    minKB: pos(q.min),
    maxKB: pos(q.max),
    widthPx: pos(q.wpx),
    heightPx: pos(q.hpx),
    widthCm: pos(q.wcm),
    heightCm: pos(q.hcm),
    dpi: pos(q.dpi) || 200,
    fromNotice: typeof q.n === "string" && /^[\w-]{4,20}$/.test(q.n),
    notice: typeof q.n === "string" && /^[\w-]{4,20}$/.test(q.n) ? q.n : null,
  };
  if (spec.minKB && spec.maxKB && spec.minKB > spec.maxKB) [spec.minKB, spec.maxKB] = [spec.maxKB, spec.minKB];
  if (!spec.widthPx || !spec.heightPx) {
    spec.widthPx = spec.heightPx = null;
    if (!spec.widthCm || !spec.heightCm) {
      spec.widthCm = KINDS[kind].widthCm;
      spec.heightCm = KINDS[kind].heightCm;
      spec.sizeGuessed = true;
    }
  }
  return spec;
}

export const cmToPx = (cm, dpi = 200) => Math.max(1, Math.round((cm / 2.54) * dpi));

// Pixel size of the file to make. Pixels win when the notice gives them; centimetres are
// turned into pixels at the chosen dpi.
export function targetPixels(spec) {
  if (spec.widthPx && spec.heightPx) return { w: Math.round(spec.widthPx), h: Math.round(spec.heightPx) };
  return { w: cmToPx(spec.widthCm, spec.dpi), h: cmToPx(spec.heightCm, spec.dpi) };
}

// The part of the source picture to use for a "cover" crop: the target's shape, as large as fits,
// shrunk by zoom and centred on (cx, cy) given as fractions of the source.
export function cropRect(srcW, srcH, aspect, zoom = 1, cx = 0.5, cy = 0.5) {
  let sw = srcW;
  let sh = srcW / aspect;
  if (sh > srcH) {
    sh = srcH;
    sw = srcH * aspect;
  }
  const z = Math.max(1, zoom);
  sw /= z;
  sh /= z;
  const sx = Math.min(Math.max(cx * srcW - sw / 2, 0), srcW - sw);
  const sy = Math.min(Math.max(cy * srcH - sh / 2, 0), srcH - sh);
  return { sx, sy, sw, sh };
}

// Where a "contain" picture (a signature) sits inside the target box, with a little white margin.
export function containRect(srcW, srcH, w, h, margin = 0.06) {
  const mw = w * (1 - 2 * margin);
  const mh = h * (1 - 2 * margin);
  const s = Math.min(mw / srcW, mh / srcH);
  const dw = srcW * s;
  const dh = srcH * s;
  return { dx: (w - dw) / 2, dy: (h - dh) / 2, dw, dh };
}

const lum = (d, i) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];

// Makes paper white and ink dark: phone photos of a signature come out grey and uneven.
// Levels are taken from the picture itself (bright paper, darkest ink) rather than a fixed threshold.
export function cleanInk(data) {
  const hist = new Uint32Array(256);
  const n = data.length / 4;
  for (let i = 0; i < data.length; i += 4) hist[Math.round(lum(data, i))]++;
  const at = (frac) => {
    let seen = 0;
    for (let v = 0; v < 256; v++) {
      seen += hist[v];
      if (seen >= n * frac) return v;
    }
    return 255;
  };
  const ink = at(0.01);
  const paper = Math.max(at(0.6) - 12, ink + 30);
  for (let i = 0; i < data.length; i += 4) {
    const t = Math.min(1, Math.max(0, (lum(data, i) - ink) / (paper - ink)));
    const v = Math.round(255 * t ** 1.4);
    data[i] = data[i + 1] = data[i + 2] = v;
    data[i + 3] = 255;
  }
  return data;
}

// The box around the ink, so a signature written in a corner of the page fills the file.
export function inkBounds(data, width, height, dark = 160) {
  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (lum(data, (y * width + x) * 4) < dark) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return null;
  const pad = Math.round(Math.max(x1 - x0, y1 - y0) * 0.04) + 2;
  return {
    x: Math.max(0, x0 - pad),
    y: Math.max(0, y0 - pad),
    w: Math.min(width, x1 + pad + 1) - Math.max(0, x0 - pad),
    h: Math.min(height, y1 + pad + 1) - Math.max(0, y0 - pad),
  };
}

// Finds the JPEG quality that lands the file inside the KB range, keeping as much quality as the
// range allows. `encode(q)` returns the byte size (and whatever else it likes) for quality q.
export async function fitToRange(encode, { minKB, maxKB }) {
  const max = maxKB ? maxKB * 1024 : Infinity;
  const min = minKB ? minKB * 1024 : 0;
  const top = await encode(0.95);
  if (top.size <= max) {
    return top.size >= min ? { ...top, quality: 0.95, ok: true } : { ...top, quality: 0.95, ok: false, why: "small" };
  }
  let lo = 0.05;
  let hi = 0.95;
  let best = null;
  for (let i = 0; i < 9; i++) {
    const q = (lo + hi) / 2;
    const r = await encode(q);
    if (r.size <= max) {
      best = { ...r, quality: q };
      lo = q;
    } else hi = q;
  }
  if (!best) {
    const floor = await encode(0.05);
    return floor.size <= max ? { ...floor, quality: 0.05, ok: floor.size >= min } : { ...floor, quality: 0.05, ok: false, why: "big" };
  }
  return { ...best, ok: best.size >= min, why: best.size >= min ? undefined : "small" };
}

export const kb = (bytes) => Math.round((bytes / 1024) * 10) / 10;
