import { NextResponse, type NextRequest } from "next/server";
import { GOOGLE_CALLBACK_PATH, OAUTH_NONCE_COOKIE, startGoogleConnect } from "@/server/http/google-connect-flow";

export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get("org") ?? "";
  const result = await startGoogleConnect(slug, request.nextUrl.searchParams.get("kind") ?? "");
  if (!result.ok) {
    const back = new URL(slug ? `/${encodeURIComponent(slug)}/connections` : "/", request.url);
    if (slug) back.searchParams.set("error", result.error);
    return NextResponse.redirect(back);
  }
  const response = NextResponse.redirect(result.url);
  response.cookies.set(OAUTH_NONCE_COOKIE, result.nonce, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: GOOGLE_CALLBACK_PATH, maxAge: 600,
  });
  return response;
}
