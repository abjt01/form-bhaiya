// The API against the built app, with no AI key: the demo notice is read by the mock reader,
// so everything from the PDF upload to the quote checks runs for real.
import assert from "node:assert/strict";
import fs from "node:fs";
import { after, before, describe, it } from "node:test";
import { fixture, getJSON, startServer, upload, waitFor } from "./helpers/server.js";

const demo = fs.readFileSync(fixture("demo-notice.pdf"));

// A real PDF with one empty page and no text, like a scanned notice.
const scanned = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF",
);

let server;
before(async () => (server = await startServer()));
after(() => server?.stop());

const get = (url) => getJSON(server.base, url);
const post = (url) => getJSON(server.base, url, "POST");

async function readDemo() {
  const { status, data } = await upload(server.base, demo, "demo-notice.pdf");
  assert.ok(status === 201 || status === 200, `upload failed: ${status} ${JSON.stringify(data)}`);
  await waitFor(async () => (await get(`/api/notices/${data.id}`)).data.status !== "reading");
  return (await get(`/api/notices/${data.id}`)).data;
}

describe("notices API", () => {
  it("is healthy and starts with the seeded library", async () => {
    assert.equal((await get("/healthz")).status, 200);
    const { data } = await get("/api/notices");
    const ids = data.notices.map((n) => n.id);
    for (const id of ["ssc-chsl-2026", "ssc-cgl-2026", "upsc-cds-2-2026"]) assert.ok(ids.includes(id), `${id} missing`);
    const cgl = data.notices.find((n) => n.id === "ssc-cgl-2026");
    assert.equal(cgl.closes, "2026-06-22");
    assert.equal(cgl.open, false);
  });

  it("reads an uploaded notice and checks every answer against the PDF", async () => {
    const n = await readDemo();
    assert.equal(n.status, "done");
    assert.equal(n.pageCount, 3);
    assert.equal(n.sha, undefined, "the file hash stays on the server");
    assert.equal(n.read.basics.exam.name, "Junior Assistant Examination, 2026");
    assert.deepEqual(
      n.read.basics.dates.map((d) => [d.kind, d.date, d.check.status]),
      [
        ["apply_start", "2026-10-01", "verified"],
        ["apply_end", "2026-11-20", "verified"],
        ["fee_end", "2026-11-21", "verified"],
        ["exam", "2027-01-17", "verified"],
      ],
    );
    assert.deepEqual(n.read.basics.fees.map((f) => f.amount), [100, 0, 0, 0]);
    assert.equal(n.read.age.rules.length, 2);
    const esm = n.read.age.relaxations.find((r) => r.esm);
    assert.equal(esm.manual, true);
    assert.equal(n.read.documents.items.length, 3);
  });

  it("flags the answer whose number isn't in the notice", async () => {
    const n = await readDemo();
    const thumb = n.read.uploads.items.find((u) => u.kind === "thumb");
    assert.equal(thumb.check.status, "check");
    assert.match(thumb.check.why, /60/);
    const sig = n.read.uploads.items.find((u) => u.kind === "signature");
    assert.deepEqual([sig.minKB, sig.maxKB, sig.widthCm, sig.heightCm, sig.check.status], [10, 20, 6, 2, "verified"]);
  });

  it("gives back the same notice when the same PDF is uploaded again", async () => {
    const first = await upload(server.base, demo, "again.pdf");
    const second = await upload(server.base, demo, "and-again.pdf");
    assert.equal(second.status, 200);
    assert.equal(second.data.existing, true);
    assert.equal(second.data.id, first.data.id);
  });

  it("refuses things that aren't readable notices, with a reason", async () => {
    let r = await upload(server.base, Buffer.from("just some text"), "notes.pdf");
    assert.equal(r.status, 400);
    assert.match(r.data.error, /isn't a PDF/);

    r = await upload(server.base, scanned, "scan.pdf");
    assert.equal(r.status, 422);
    assert.match(r.data.error, /scanned image/);

    const res = await fetch(`${server.base}/api/notices`, { method: "POST", body: new FormData() });
    assert.equal(res.status, 400);
    assert.match((await res.json()).error, /Choose the notice PDF/);
  });

  it("answers 404 for a notice that doesn't exist", async () => {
    const r = await get("/api/notices/nope-nope");
    assert.equal(r.status, 404);
    assert.equal((await post("/api/notices/nope-nope/retry")).status, 404);
  });

  it("returns no Hindi without an AI key, and doesn't break the slip", async () => {
    const r = await post("/api/notices/ssc-cgl-2026/hindi");
    assert.equal(r.status, 200);
    assert.deepEqual(r.data.hi, {});
  });

  it("can re-read a finished notice without losing anything", async () => {
    const n = await readDemo();
    const r = await post(`/api/notices/${n.id}/retry`);
    assert.equal(r.status, 202);
    const again = await waitFor(async () => {
      const x = (await get(`/api/notices/${n.id}`)).data;
      return x.status !== "reading" && x;
    });
    assert.equal(again.status, "done");
    assert.deepEqual(again.read, n.read);
  });

  it("serves the seeded notices without their page text", async () => {
    const { data } = await get("/api/notices/ssc-chsl-2026");
    assert.equal(data.status, "done");
    assert.equal(data.pages, undefined);
    assert.ok(data.read.age.relaxations.length >= 5);
  });
});
