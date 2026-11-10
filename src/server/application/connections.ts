import { DomainError } from "@/domain/errors/domain-error";
import type { AuditLogRepository, ConnectionRepository, ConnectionUsage } from "@/domain/ports/repositories";
import type { ConnectionRecord } from "@/domain/ports/records";
import type { Clock, ConnectionProbe, GoogleOAuthClient, ProbeResult, SecretBox } from "@/domain/ports/services";
import { normalizeEmail } from "@/domain/value-objects/email-address";
import { isGoogleKind, type MailServerKind } from "@/domain/value-objects/connection";
import type { AuthorizationService } from "./authorization";

export interface MailAccountInput {
  actorId: string;
  orgId: string;
  kind: MailServerKind;
  label: string;
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
}

/** Saves an IMAP or SMTP login (app password). The login is tested first, so a wrong password is never stored. */
export class AddMailAccount {
  constructor(
    private readonly repo: ConnectionRepository,
    private readonly authz: AuthorizationService,
    private readonly secrets: SecretBox,
    private readonly probe: ConnectionProbe,
    private readonly clock: Clock,
    private readonly audit: AuditLogRepository,
  ) {}

  async execute(input: MailAccountInput): Promise<ConnectionRecord> {
    await this.authz.require(input.actorId, input.orgId, "connections.manage");
    const accountEmail = normalizeEmail(input.username);
    if (!accountEmail) throw new DomainError("validation", "Enter the full email address as the username.");
    const config = { host: input.host.trim().toLowerCase(), port: input.port, secure: input.secure, username: input.username.trim() };
    if (await this.repo.findByAccount(input.orgId, input.kind, accountEmail)) {
      throw new DomainError("conflict", "That mail account is already connected. Remove it first to change its password.");
    }
    const secretJson = JSON.stringify({ password: input.password });
    const result = await this.probe.check(input.kind, config, secretJson);
    if (!result.ok) throw new DomainError("validation", result.message);
    const record = await this.repo.create({
      orgId: input.orgId, kind: input.kind, label: input.label.trim() || accountEmail, accountEmail, config,
      secretCiphertext: await this.secrets.encrypt(input.orgId, secretJson), createdBy: input.actorId,
    });
    await this.repo.recordCheck(input.orgId, record.id, { status: "active", error: null, at: this.clock.now() });
    await this.audit.record({ orgId: input.orgId, actorUserId: input.actorId, action: "connection.added", entityType: "connection", entityId: record.id, metadata: { kind: input.kind, account: accountEmail } });
    return record;
  }
}

/** Re-checks a saved connection against the provider and records whether it still works. */
export class TestConnection {
  constructor(
    private readonly repo: ConnectionRepository,
    private readonly authz: AuthorizationService,
    private readonly secrets: SecretBox,
    private readonly probe: ConnectionProbe,
    private readonly clock: Clock,
  ) {}

  async execute(input: { actorId: string; orgId: string; connectionId: string }): Promise<ProbeResult> {
    await this.authz.require(input.actorId, input.orgId, "connections.manage");
    const connection = await this.repo.find(input.orgId, input.connectionId);
    const cipher = connection ? await this.repo.findSecret(input.orgId, input.connectionId) : null;
    if (!connection || !cipher) throw new DomainError("not_found", "Connection not found");
    const result = await this.probe.check(connection.kind, connection.config, await this.secrets.decrypt(input.orgId, cipher));
    await this.repo.recordCheck(input.orgId, connection.id, {
      status: result.ok ? "active" : "needs_attention", error: result.ok ? null : result.message, at: this.clock.now(),
    });
    return result;
  }
}

export class RemoveConnection {
  constructor(
    private readonly repo: ConnectionRepository,
    private readonly authz: AuthorizationService,
    private readonly audit: AuditLogRepository,
    private readonly secrets: SecretBox,
    private readonly google: GoogleOAuthClient,
    private readonly usage: ConnectionUsage,
  ) {}

  async execute(input: { actorId: string; orgId: string; connectionId: string }): Promise<{ revoked: boolean }> {
    await this.authz.require(input.actorId, input.orgId, "connections.manage");
    const connection = await this.repo.find(input.orgId, input.connectionId);
    if (!connection) throw new DomainError("not_found", "Connection not found");
    const users = await this.usage.namesUsing(input.orgId, connection.id);
    if (users.length > 0) throw new DomainError("validation", `This connection is used by ${users.slice(0, 3).join(", ")}${users.length > 3 ? " and more" : ""}. Change or delete those first.`);
    const revoked = await this.revokeAtGoogle(connection.kind, input.orgId, connection.id);
    await this.repo.remove(input.orgId, connection.id);
    await this.audit.record({ orgId: input.orgId, actorUserId: input.actorId, action: "connection.removed", entityType: "connection", entityId: connection.id, metadata: { kind: connection.kind, account: connection.accountEmail, revoked } });
    return { revoked };
  }

  /** Google connections: also withdraw the grant at Google. A failure here never blocks removal. */
  private async revokeAtGoogle(kind: ConnectionRecord["kind"], orgId: string, id: string): Promise<boolean> {
    if (!isGoogleKind(kind)) return false;
    try {
      const cipher = await this.repo.findSecret(orgId, id);
      if (!cipher) return false;
      const { refreshToken } = JSON.parse(await this.secrets.decrypt(orgId, cipher)) as { refreshToken?: string };
      if (!refreshToken) return false;
      await this.google.revoke(kind, refreshToken);
      return true;
    } catch {
      return false;
    }
  }
}

/** Replaces the app password of a saved mail account, so sources that use it keep working. */
export class UpdateMailPassword {
  constructor(
    private readonly repo: ConnectionRepository,
    private readonly authz: AuthorizationService,
    private readonly secrets: SecretBox,
    private readonly probe: ConnectionProbe,
    private readonly clock: Clock,
    private readonly audit: AuditLogRepository,
  ) {}

  async execute(input: { actorId: string; orgId: string; connectionId: string; password: string }): Promise<void> {
    await this.authz.require(input.actorId, input.orgId, "connections.manage");
    const connection = await this.repo.find(input.orgId, input.connectionId);
    if (!connection) throw new DomainError("not_found", "Connection not found");
    if (isGoogleKind(connection.kind)) throw new DomainError("validation", "Google accounts are reconnected through Google, not with a password.");
    const secretJson = JSON.stringify({ password: input.password });
    const result = await this.probe.check(connection.kind, connection.config, secretJson);
    if (!result.ok) throw new DomainError("validation", result.message);
    await this.repo.replaceSecret(input.orgId, connection.id, await this.secrets.encrypt(input.orgId, secretJson));
    await this.repo.recordCheck(input.orgId, connection.id, { status: "active", error: null, at: this.clock.now() });
    await this.audit.record({ orgId: input.orgId, actorUserId: input.actorId, action: "connection.password_updated", entityType: "connection", entityId: connection.id, metadata: { kind: connection.kind, account: connection.accountEmail } });
  }
}

/** Any member may see which accounts are linked (never their secrets); only managers change them. */
export class ListConnections {
  constructor(private readonly repo: ConnectionRepository) {}
  execute(orgId: string): Promise<ConnectionRecord[]> {
    return this.repo.list(orgId);
  }
}
