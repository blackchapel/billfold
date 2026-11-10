import { NextResponse, type NextRequest } from "next/server";
import { completeGoogleSignIn } from "@/server/http/auth-callback";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const outcome = await completeGoogleSignIn(url.searchParams.get("code"));
  const path = outcome === "ok" ? "/" : outcome === "not_allowlisted" ? "/not-authorised" : "/sign-in?error=1";
  return NextResponse.redirect(new URL(path, process.env.NEXT_PUBLIC_APP_URL ?? url.origin));
}
