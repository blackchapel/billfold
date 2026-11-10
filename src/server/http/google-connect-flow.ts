import "server-only";
import { randomBytes } from "node:crypto";
import { DomainError } from "@/domain/errors/domain-error";
import { isGoogleKind, type GoogleKind } from "@/domain/value-objects/connection";
import { authGateway } from "../composition-root/auth-gateway";
import { container } from "../composition-root/container";
import { logEvent, safeMessage } from "@/lib/log";
import { requireOrg } from "./session";

export const OAUTH_NONCE_COOKIE = "bf_oauth_nonce";
export const GOOGLE_CALLBACK_PATH = "/api/connections/google/callback";
const STATE_TTL_SECONDS = 600;

const redirectUri = () => `${authGateway.appUrl()}${GOOGLE_CALLBACK_PATH}`;

export type StartResult = { ok: true; url: string; nonce: string } | { ok: false; error: string };

/** Step 1: build Google's consent URL. The signed state ties the round trip to this user, org and browser. */
export async function startGoogleConnect(slug: string, kindParam: string): Promise<StartResult> {
  const { user, permissions } = await requireOrg(slug);
  if (!permissions.includes("connections.manage")) return { ok: false, error: "You do not have permission to manage connections." };
  if (!isGoogleKind(kindParam)) return { ok: false, error: "Unknown connection type." };
  const kind: GoogleKind = kindParam;
  const c = container();
  if (!c.google.isConfigured(kind)) return { ok: false, error: "Google sign-in for this connection is not set up yet. See the setup guide." };
  const nonce = randomBytes(16).toString("hex");
  const state = c.stateSigner.sign({ slug, kind, uid: user.id, nonce }, STATE_TTL_SECONDS);
  return { ok: true, url: c.google.authorizeUrl(kind, state, redirectUri()), nonce };
}

export interface FinishInput { state: string | null; code: string | null; googleError: string | null; nonceCookie: string | null }
export type FinishResult = { slug: string | null; error: string | null };

/** Step 2: Google sent the browser back. Verify it is the same flow, then store the connection. */
export async function finishGoogleConnect(input: FinishInput): Promise<FinishResult> {
  const payload = input.state ? container().stateSigner.verify(input.state) : null;
  const slug = typeof payload?.slug === "string" ? payload.slug : null;
  const kind = typeof payload?.kind === "string" ? payload.kind : "";
  if (!payload || !slug || !isGoogleKind(kind) || !input.nonceCookie || payload.nonce !== input.nonceCookie) {
    return { slug: null, error: "That connection attempt expired or did not start here. Please try again." };
  }
  const { user, membership } = await requireOrg(slug);
  if (user.id !== payload.uid) return { slug, error: "That connection attempt belongs to a different sign-in." };
  if (input.googleError || !input.code) {
    return { slug, error: input.googleError === "access_denied" ? "Google access was not granted, so nothing was connected." : "Google did not complete the connection." };
  }
  try {
    await container().completeGoogleConnect.execute({ actorId: user.id, orgId: membership.orgId, kind, code: input.code, redirectUri: redirectUri() });
    return { slug, error: null };
  } catch (e) {
    if (e instanceof DomainError) return { slug, error: e.code === "validation" ? e.message : "You do not have permission to manage connections." };
    logEvent("google_connect_failed", { kind, message: safeMessage(e) });
    return { slug, error: "Something went wrong while connecting. Please try again." };
  }
}
