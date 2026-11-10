import { NextResponse, type NextRequest } from "next/server";
import { finishGoogleConnect, GOOGLE_CALLBACK_PATH, OAUTH_NONCE_COOKIE } from "@/server/http/google-connect-flow";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const result = await finishGoogleConnect({
    state: q.get("state"), code: q.get("code"), googleError: q.get("error"), nonceCookie: request.cookies.get(OAUTH_NONCE_COOKIE)?.value ?? null,
  });
  const back = new URL(result.slug ? `/${encodeURIComponent(result.slug)}/connections` : "/", request.url);
  if (result.error) back.searchParams.set("error", result.error);
  else back.searchParams.set("connected", "1");
  const response = NextResponse.redirect(back);
  response.cookies.set(OAUTH_NONCE_COOKIE, "", { path: GOOGLE_CALLBACK_PATH, maxAge: 0 }); // one use only
  return response;
}
