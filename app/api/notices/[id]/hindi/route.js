import { rateLimit, route } from "@/lib/http";
import { hindi } from "@/lib/notices";

export const POST = route(async (req, { params }) => {
  rateLimit(req, "hindi", 20, 10 * 60_000);
  const { id } = await params;
  return Response.json({ hi: await hindi(id) });
});
