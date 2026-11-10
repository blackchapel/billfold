import { NextResponse, type NextRequest } from "next/server";
import { runConnectionHealthSweep } from "@/server/http/connection-health-sweep";

export const maxDuration = 60;

/** Daily connection health check. Vercel cron sends "Authorization: Bearer $CRON_SECRET". */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  return NextResponse.json({ ok: true, ...(await runConnectionHealthSweep()) });
}
