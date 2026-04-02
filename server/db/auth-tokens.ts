import { and, eq, sql } from "drizzle-orm";
import { adminVerificationCodes } from "../../drizzle/schema";
import { getDb } from "./core";

export async function createAdminVerificationCode(userId: number): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(adminVerificationCodes)
    .set({ used: true })
    .where(and(eq(adminVerificationCodes.userId, userId), eq(adminVerificationCodes.used, false)));
  const code = String(Math.floor(10000000 + Math.random() * 90000000));
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  await db.insert(adminVerificationCodes).values({ userId, code, expiresAt });
  return code;
}

export async function verifyAdminCode(userId: number, code: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const result = await db
    .select({ id: adminVerificationCodes.id })
    .from(adminVerificationCodes)
    .where(
      and(
        eq(adminVerificationCodes.userId, userId),
        eq(adminVerificationCodes.code, code),
        eq(adminVerificationCodes.used, false),
        sql`${adminVerificationCodes.expiresAt} > NOW()`
      )
    )
    .limit(1);
  if (result.length === 0) return false;
  await db.update(adminVerificationCodes)
    .set({ used: true })
    .where(eq(adminVerificationCodes.id, result[0].id));
  return true;
}
