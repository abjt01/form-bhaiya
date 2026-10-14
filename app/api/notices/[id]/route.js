import { after } from "next/server";
import { route } from "@/lib/http";
import { getNotice, needsResume, publicNotice, readNotice } from "@/lib/notices";

export const dynamic = "force-dynamic";

export const GET = route(async (_req, { params }) => {
  const { id } = await params;
  const n = await getNotice(id);
  if (needsResume(n)) after(() => readNotice(id));
  return Response.json(publicNotice(n));
});
