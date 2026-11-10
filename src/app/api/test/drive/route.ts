import { NextResponse } from "next/server";
import { container } from "@/server/composition-root/container";

/** Test mode only: what the stand-in Google Drive was asked to store, so end-to-end tests can check folders and names. Does not exist in production. */
export async function GET() {
  const drive = container().testDrive; // null unless BILLFOLD_TEST_MODE is on
  if (!drive) return new NextResponse(null, { status: 404 });
  return NextResponse.json({ uploads: drive.uploads });
}
