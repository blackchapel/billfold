import { NextResponse, type NextRequest } from "next/server";
import { pingDatabase } from "@/server/composition-root/health";

/** Daily keep-alive for the Supabase free tier. Vercel cron sends "Authorization: Bearer $CRON_SECRET". */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  await pingDatabase();
  return NextResponse.json({ ok: true });
}
