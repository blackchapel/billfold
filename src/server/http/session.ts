import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { DomainError } from "@/domain/errors/domain-error";
import type { SessionUser } from "@/types/auth";
import { authGateway, type AuthIdentity } from "../composition-root/auth-gateway";
import { container } from "../composition-root/container";

async function resolveIdentity(): Promise<AuthIdentity | null> {
  if (!authGateway.isTestMode()) return authGateway.identity();
  const id = await authGateway.testSessionUserId();
  const user = id ? await container().repos.users.findById(id) : null;
  return user ? { id: user.id, email: user.email, name: user.name, avatarUrl: user.avatarUrl } : null;
}

/** Identity is read once per request for pages (the cookie check can cost a round trip to the auth provider). */
const identityOnce = cache(resolveIdentity);
const membershipsOnce = cache((userId: string) => container().repos.orgs.listForUser(userId));
/** The outer layout, the organisation layout and the page all ask whether this person is still allowed in; ask the database once. */
const allowedOnce = cache((email: string) => container().signInGate.isStillAllowed(email));

/**
 * Returns the signed-in, still-allowlisted user, or null.
 * Wrapped in React's per-request `cache`: the layouts and the page of one navigation all ask, and without it every
 * one of them repeated the Supabase Auth call and the allowlist query, which made each tab switch several times slower.
 */
export const currentUser = cache(async function currentUser(): Promise<SessionUser | null> {
  const identity = await identityOnce();
  if (!identity) return null;
  const gate = container().signInGate;
  if (!(await allowedOnce(identity.email))) return null;
  return { ...identity, isSuperAdmin: gate.isSuperAdmin(identity.email) };
});

export async function requireUser(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) redirect("/sign-in");
  return user;
}

export async function requireSuperAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (!user.isSuperAdmin) throw new DomainError("forbidden", "Super admin only");
  return user;
}

/**
 * Who is signed in, which organisation this is, and what they may do there, in as few round trips as possible:
 * the identity first, then the allowlist check and the person's memberships together (one query serves both the
 * organisation being opened and the organisation switcher). `fresh` skips the per-request memo, for actions.
 */
async function loadOrg(slug: string, fresh: boolean) {
  const c = container();
  const identity = await (fresh ? resolveIdentity() : identityOnce());
  if (!identity) redirect("/sign-in");
  const [allowed, memberships] = await Promise.all([
    fresh ? c.signInGate.isStillAllowed(identity.email) : allowedOnce(identity.email),
    fresh ? c.repos.orgs.listForUser(identity.id) : membershipsOnce(identity.id),
  ]);
  if (!allowed) redirect("/sign-in");
  const membership = memberships.find((m) => m.org.slug === slug);
  if (!membership) redirect("/"); // same answer for "no such organisation" and "not a member": existence is not leaked
  const user: SessionUser = { ...identity, isSuperAdmin: c.signInGate.isSuperAdmin(identity.email) };
  return { user, membership, memberships, permissions: await c.authz.permissionsFor(membership) };
}

/** For pages and layouts: cached per request so the layout and the page of one navigation share a single lookup. */
export const requireOrg = cache((slug: string) => loadOrg(slug, false));

/**
 * For server actions and route handlers: never cached. An action changes data (rename, transfer ownership, ...) and Next
 * then re-renders the page in the same request, which must see the new state rather than the lookup made before the change.
 */
export const requireOrgFresh = (slug: string) => loadOrg(slug, true);
