import { deliverAllDue } from "@/server/notifications/outbox";

/**
 * Retries queued emails. Call it every few minutes from a scheduler (e.g. Vercel Cron)
 * with `Authorization: Bearer $CRON_SECRET`.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const result = await deliverAllDue();
  return Response.json(result);
}
