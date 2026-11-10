import { NextResponse } from "next/server";
import { container } from "@/server/composition-root/container";

/** Test mode only: the emails the stub "sent", so end-to-end tests can check them. Does not exist in production. */
export async function GET() {
  const outbox = container().testOutbox; // null unless BILLFOLD_TEST_MODE is on
  if (!outbox) return new NextResponse(null, { status: 404 });
  return NextResponse.json({ sent: outbox.sent });
}
