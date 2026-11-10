import "server-only";
import { z } from "zod";

const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  DATABASE_URL: z.string().min(1),
  MASTER_ENCRYPTION_KEY: z.string().regex(/^[A-Za-z0-9+/=]{43,44}$/, "Must be 32 random bytes, base64"),
  SUPER_ADMIN_EMAILS: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.string().url(),
  CRON_SECRET: z.string().min(16).optional(),
  // Google project A (verified: login + Drive) and project B (unverified: Gmail). Optional until the owner creates them.
  GOOGLE_A_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_A_CLIENT_SECRET: z.string().min(1).optional(),
  GOOGLE_B_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_B_CLIENT_SECRET: z.string().min(1).optional(),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function env(): Env {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      const names = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
      throw new Error(`Invalid or missing environment variables: ${names}`);
    }
    cached = parsed.data;
  }
  return cached;
}

export function superAdminEmails(): string[] {
  return env().SUPER_ADMIN_EMAILS.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
}

export function googleProjects(): { drive: { clientId: string; clientSecret: string } | null; gmail: { clientId: string; clientSecret: string } | null } {
  const e = env();
  const pair = (id?: string, secret?: string) => (id && secret ? { clientId: id, clientSecret: secret } : null);
  return { drive: pair(e.GOOGLE_A_CLIENT_ID, e.GOOGLE_A_CLIENT_SECRET), gmail: pair(e.GOOGLE_B_CLIENT_ID, e.GOOGLE_B_CLIENT_SECRET) };
}
