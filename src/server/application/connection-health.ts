import type { ConnectionRepository, OrgRepository } from "@/domain/ports/repositories";
import type { ConnectionRecord } from "@/domain/ports/records";
import type { Clock, ConnectionProbe, SecretBox } from "@/domain/ports/services";

export interface HealthSweepResult { checked: number; failing: number; skipped: number }

/**
 * Re-checks every saved connection so expired logins (Gmail test-mode tokens last 7 days) show up on their own.
 * Runs from the daily cron. Oldest-checked first, with a time budget so one slow server cannot starve the rest.
 */
export class CheckAllConnections {
  constructor(
    private readonly orgs: OrgRepository,
    private readonly repo: ConnectionRepository,
    private readonly secrets: SecretBox,
    private readonly probe: ConnectionProbe,
    private readonly clock: Clock,
    private readonly budgetMs = 45_000,
  ) {}

  async execute(): Promise<HealthSweepResult> {
    const started = this.clock.now().getTime();
    const all: ConnectionRecord[] = [];
    for (const org of await this.orgs.listAll()) all.push(...(await this.repo.list(org.id)));
    all.sort((a, b) => (a.lastCheckedAt?.getTime() ?? 0) - (b.lastCheckedAt?.getTime() ?? 0));

    const result: HealthSweepResult = { checked: 0, failing: 0, skipped: 0 };
    for (const c of all) {
      if (this.clock.now().getTime() - started >= this.budgetMs) { result.skipped++; continue; }
      const outcome = await this.checkOne(c);
      await this.repo.recordCheck(c.orgId, c.id, { status: outcome.ok ? "active" : "needs_attention", error: outcome.ok ? null : outcome.message, at: this.clock.now() });
      result.checked++;
      if (!outcome.ok) result.failing++;
    }
    return result;
  }

  private async checkOne(c: ConnectionRecord): Promise<{ ok: boolean; message: string }> {
    try {
      const cipher = await this.repo.findSecret(c.orgId, c.id);
      if (!cipher) return { ok: false, message: "The saved credentials are missing. Reconnect this account." };
      return await this.probe.check(c.kind, c.config, await this.secrets.decrypt(c.orgId, cipher));
    } catch {
      return { ok: false, message: "The saved credentials could not be read. Reconnect this account." };
    }
  }
}
