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

/**
 * Returns the signed-in, still-allowlisted user, or null.
 * Wrapped in React's per-request `cache`: the layouts and the page of one navigation all ask, and without it every
 * one of them repeated the Supabase Auth call and the allowlist query, which made each tab switch several times slower.
 */
export const currentUser = cache(async function currentUser(): Promise<SessionUser | null> {
  const identity = await resolveIdentity();
  if (!identity) return null;
  const gate = container().signInGate;
  if (!(await gate.isStillAllowed(identity.email))) return null;
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

async function loadOrg(slug: string) {
  const user = await requireUser();
  const c = container();
  try {
    const membership = await c.authz.membershipBySlug(user.id, slug);
    const permissions = await c.authz.permissionsFor(membership);
    return { user, membership, permissions };
  } catch (e) {
    if (e instanceof DomainError && e.code === "not_found") redirect("/");
    throw e;
  }
}

/** For pages and layouts: cached per request so the layout and the page of one navigation share a single membership lookup. */
export const requireOrg = cache(loadOrg);

/**
 * For server actions and route handlers: never cached. An action changes data (rename, transfer ownership, ...) and Next
 * then re-renders the page in the same request, which must see the new state rather than the lookup made before the change.
 */
export const requireOrgFresh = loadOrg;
