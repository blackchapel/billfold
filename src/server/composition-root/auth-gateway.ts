import "server-only";
import { cookies } from "next/headers";
import { logEvent, safeMessage } from "@/lib/log";
import { env } from "../infra/config/env";
import { supabaseServer } from "../infra/auth/supabase-server";
import { isTestMode, TEST_SESSION_COOKIE } from "../infra/auth/test-mode";

export interface AuthIdentity {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
}

/** Everything the HTTP layer needs from the auth provider (Supabase) or from test mode. */
export const authGateway = {
  isTestMode,

  async googleSignInUrl(): Promise<string | null> {
    const { data, error } = await (await supabaseServer()).auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${env().NEXT_PUBLIC_APP_URL}/auth/callback`, queryParams: { prompt: "select_account" } },
    });
    return error ? null : (data.url ?? null);
  },

  async exchangeCode(code: string): Promise<boolean> {
    const { error } = await (await supabaseServer()).auth.exchangeCodeForSession(code);
    if (error) logEvent("auth_exchange_failed", { message: safeMessage(error), status: error.status ?? null, code: error.code ?? null });
    return !error;
  },

  async identity(): Promise<AuthIdentity | null> {
    const { data } = await (await supabaseServer()).auth.getUser();
    const u = data.user;
    if (!u?.email) return null;
    return {
      id: u.id,
      email: u.email,
      name: (u.user_metadata?.full_name as string | undefined) ?? null,
      avatarUrl: (u.user_metadata?.avatar_url as string | undefined) ?? null,
    };
  },

  async signOut(): Promise<void> {
    await (await supabaseServer()).auth.signOut();
  },

  async testSessionUserId(): Promise<string | null> {
    return (await cookies()).get(TEST_SESSION_COOKIE)?.value ?? null;
  },
  async setTestSession(userId: string): Promise<void> {
    (await cookies()).set(TEST_SESSION_COOKIE, userId, { httpOnly: true, sameSite: "lax", path: "/" });
  },
  async clearTestSession(): Promise<void> {
    (await cookies()).delete(TEST_SESSION_COOKIE);
  },
  appUrl: () => env().NEXT_PUBLIC_APP_URL,
};
