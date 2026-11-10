import { NextResponse } from "next/server";
import { container } from "@/server/composition-root/container";

/** Test mode only: forgets everything the in-memory cache holds, for tests that change the database directly. Does not exist in production. */
export async function POST() {
  const cache = container().testCache; // null unless BILLFOLD_TEST_MODE is on
  if (!cache) return new NextResponse(null, { status: 404 });
  cache.store.clear();
  return NextResponse.json({ ok: true });
}
