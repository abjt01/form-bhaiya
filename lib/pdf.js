import { HttpError } from "./http.js";

export const MAX_PDF_BYTES = 20 * 1024 * 1024;
const MAX_PAGES = 300;

// Text of every page. Notices are mostly real text PDFs; a scanned one has almost none,
// and reading it would need OCR, which this app doesn't pretend to do.
export async function pdfPages(bytes) {
  if (bytes.length > MAX_PDF_BYTES) throw new HttpError(413, "That PDF is bigger than 20 MB.");
  if (Buffer.from(bytes.subarray(0, 5)).toString("latin1") !== "%PDF-") throw new HttpError(400, "That file isn't a PDF.");

  const { extractText, getDocumentProxy } = await import("unpdf");
  let pages;
  try {
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    if (pdf.numPages > MAX_PAGES) throw new HttpError(413, `That PDF has ${pdf.numPages} pages. Notices up to ${MAX_PAGES} pages work.`);
    ({ text: pages } = await extractText(pdf, { mergePages: false }));
  } catch (err) {
    if (err instanceof HttpError) throw err;
    if (/password/i.test(err?.message || "")) throw new HttpError(400, "That PDF is password protected.");
    throw new HttpError(400, "That PDF couldn't be opened. Try downloading it again.");
  }

  pages = pages.map((p) => String(p || "").replace(/\u0000/g, ""));
  const chars = pages.reduce((a, p) => a + p.replace(/\s/g, "").length, 0);
  if (chars < 400 || chars / pages.length < 80) {
    throw new HttpError(422, "This PDF is a scanned image with no text in it, so it can't be read here. Look for a text version of the notice on the official site.");
  }
  return pages;
}
