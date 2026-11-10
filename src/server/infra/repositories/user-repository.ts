import { eq } from "drizzle-orm";
import type { UserRepository } from "@/domain/ports/repositories";
import type { UserRecord } from "@/domain/ports/records";
import type { Db } from "../db/create";
import { users } from "../db/schema";

const toRecord = (r: typeof users.$inferSelect): UserRecord => ({
  id: r.id, email: r.email, name: r.name, avatarUrl: r.avatarUrl, lastActiveOrgId: r.lastActiveOrgId,
});

export class DrizzleUserRepository implements UserRepository {
  constructor(private readonly db: Db) {}

  async upsert(user: Omit<UserRecord, "lastActiveOrgId">) {
    const [row] = await this.db.insert(users).values(user).onConflictDoUpdate({
      target: users.id,
      set: { email: user.email, name: user.name, avatarUrl: user.avatarUrl },
    }).returning();
    if (!row) throw new Error("User upsert returned no row");
    return toRecord(row);
  }

  async findById(id: string) {
    const [row] = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    return row ? toRecord(row) : null;
  }

  async setLastActiveOrg(userId: string, orgId: string) {
    await this.db.update(users).set({ lastActiveOrgId: orgId }).where(eq(users.id, userId));
  }

  async listAll() {
    return (await this.db.select().from(users).orderBy(users.email)).map(toRecord);
  }
}
