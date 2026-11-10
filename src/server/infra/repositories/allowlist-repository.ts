import { eq } from "drizzle-orm";
import type { AllowlistRepository } from "@/domain/ports/repositories";
import type { Db } from "../db/create";
import { platformAllowlist } from "../db/schema";

export class DrizzleAllowlistRepository implements AllowlistRepository {
  constructor(private readonly db: Db) {}

  async isAllowed(email: string) {
    const rows = await this.db.select({ id: platformAllowlist.id }).from(platformAllowlist).where(eq(platformAllowlist.email, email)).limit(1);
    return rows.length > 0;
  }

  async list() {
    const rows = await this.db.select().from(platformAllowlist).orderBy(platformAllowlist.email);
    return rows.map((r) => ({ email: r.email, note: r.note, addedBy: r.addedBy, createdAt: r.createdAt }));
  }

  async add(email: string, addedBy: string, note: string | null) {
    await this.db.insert(platformAllowlist).values({ email, addedBy, note }).onConflictDoNothing();
  }

  async remove(email: string) {
    await this.db.delete(platformAllowlist).where(eq(platformAllowlist.email, email));
  }
}
