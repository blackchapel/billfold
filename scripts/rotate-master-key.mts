// Re-wraps every org data key from MASTER_ENCRYPTION_KEY to MASTER_ENCRYPTION_KEY_NEXT in one transaction.
// Run it with both set, then swap the env values in Vercel and remove the old one. Secrets themselves are untouched.
import postgres from "postgres";
import { rewrapDataKey } from "../src/server/infra/crypto/rewrap";

const { DATABASE_URL, MASTER_ENCRYPTION_KEY, MASTER_ENCRYPTION_KEY_NEXT } = process.env;
if (!DATABASE_URL || !MASTER_ENCRYPTION_KEY || !MASTER_ENCRYPTION_KEY_NEXT) {
  throw new Error("DATABASE_URL, MASTER_ENCRYPTION_KEY and MASTER_ENCRYPTION_KEY_NEXT are required");
}
if (MASTER_ENCRYPTION_KEY === MASTER_ENCRYPTION_KEY_NEXT) throw new Error("The new key must differ from the current key");

const sql = postgres(DATABASE_URL, { max: 1, prepare: false });
try {
  const count = await sql.begin(async (tx) => {
    const rows = await tx<{ id: string; wrapped_data_key: string }[]>`select id, wrapped_data_key from org_keys for update`;
    for (const row of rows) {
      const next = rewrapDataKey(row.wrapped_data_key, MASTER_ENCRYPTION_KEY, MASTER_ENCRYPTION_KEY_NEXT);
      await tx`update org_keys set wrapped_data_key = ${next}, updated_at = now() where id = ${row.id}`;
    }
    return rows.length;
  });
  console.log(`Re-wrapped ${count} org key(s). Now set MASTER_ENCRYPTION_KEY to the new value and redeploy.`);
} finally {
  await sql.end();
}
