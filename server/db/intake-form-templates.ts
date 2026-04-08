/**
 * DB helpers for intake form templates (subscriber-owned).
 *
 * All queries are scoped to the ownerUserId for row-level security.
 */
import { eq, and, asc } from "drizzle-orm";
import { getDb } from "./core";
import { intakeFormTemplates } from "../../drizzle/schema";
import type { IntakeFormTemplate, InsertIntakeFormTemplate } from "../../drizzle/schema";

export type { IntakeFormTemplate, InsertIntakeFormTemplate };

export async function dbListIntakeFormTemplates(ownerUserId: number): Promise<IntakeFormTemplate[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(intakeFormTemplates)
    .where(
      and(
        eq(intakeFormTemplates.ownerUserId, ownerUserId),
        eq(intakeFormTemplates.active, true),
      )
    )
    .orderBy(asc(intakeFormTemplates.id));
}

export async function dbGetIntakeFormTemplateById(
  id: number,
  ownerUserId: number
): Promise<IntakeFormTemplate | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(intakeFormTemplates)
    .where(
      and(
        eq(intakeFormTemplates.id, id),
        eq(intakeFormTemplates.ownerUserId, ownerUserId),
      )
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function dbCountActiveIntakeFormTemplates(ownerUserId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const rows = await db
    .select({ id: intakeFormTemplates.id })
    .from(intakeFormTemplates)
    .where(
      and(
        eq(intakeFormTemplates.ownerUserId, ownerUserId),
        eq(intakeFormTemplates.active, true),
      )
    );
  return rows.length;
}

export async function dbCreateIntakeFormTemplate(
  values: InsertIntakeFormTemplate
): Promise<IntakeFormTemplate> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const result = await db
    .insert(intakeFormTemplates)
    .values(values)
    .returning();
  return result[0];
}

export async function dbUpdateIntakeFormTemplate(
  id: number,
  ownerUserId: number,
  updates: Partial<Pick<InsertIntakeFormTemplate, "title" | "baseLetterType" | "fieldConfig">>
): Promise<IntakeFormTemplate | null> {
  const db = await getDb();
  if (!db) return null;
  const result = await db
    .update(intakeFormTemplates)
    .set({
      ...updates,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(intakeFormTemplates.id, id),
        eq(intakeFormTemplates.ownerUserId, ownerUserId),
      )
    )
    .returning();
  return result[0] ?? null;
}

export async function dbDeleteIntakeFormTemplate(
  id: number,
  ownerUserId: number
): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const result = await db
    .update(intakeFormTemplates)
    .set({ active: false, updatedAt: new Date() })
    .where(
      and(
        eq(intakeFormTemplates.id, id),
        eq(intakeFormTemplates.ownerUserId, ownerUserId),
      )
    )
    .returning({ id: intakeFormTemplates.id });
  return result.length > 0;
}
