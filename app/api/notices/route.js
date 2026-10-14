import { after } from "next/server";
import { HttpError, rateLimit, route } from "@/lib/http";
import { createNotice, listNotices, readNotice } from "@/lib/notices";
import { MAX_PDF_BYTES } from "@/lib/pdf";

export const dynamic = "force-dynamic";

export const GET = route(async () => Response.json({ notices: await listNotices() }));

export const POST = route(async (req) => {
  rateLimit(req, "upload", 8, 10 * 60_000);
  if (Number(req.headers.get("content-length") || 0) > MAX_PDF_BYTES + 64 * 1024) throw new HttpError(413, "That PDF is bigger than 20 MB.");
  let form;
  try {
    form = await req.formData();
  } catch {
    throw new HttpError(400, "Send the notice as a PDF file.");
  }
  const file = form.get("pdf");
  if (!file || typeof file === "string") throw new HttpError(400, "Choose the notice PDF first.");
  const bytes = Buffer.from(await file.arrayBuffer());
  const { id, existing } = await createNotice(bytes, file.name);
  if (!existing) after(() => readNotice(id));
  return Response.json({ id, existing }, { status: existing ? 200 : 201 });
});
