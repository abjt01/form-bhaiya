import { after } from "next/server";
import { rateLimit, route } from "@/lib/http";
import { readNotice, retryNotice } from "@/lib/notices";

export const POST = route(async (req, { params }) => {
  rateLimit(req, "retry", 10, 10 * 60_000);
  const { id } = await params;
  await retryNotice(id);
  after(() => readNotice(id));
  return Response.json({ ok: true }, { status: 202 });
});
