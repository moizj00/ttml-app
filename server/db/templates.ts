/**
 * Database helpers for letter templates.
 *
 * These thin wrappers centralise all Drizzle queries for the letterTemplates
 * table so that routers never import getDb directly.
 */

import { TRPCError } from "@trpc/server";
import { eq, asc, and } from "drizzle-orm";
import { getDb } from "./core";
import { letterTemplates, letterTypeEnum } from "../../drizzle/schema";

type LetterType = (typeof letterTypeEnum.enumValues)[number];

async function db() {
  const database = await getDb();
  if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  return database;
}

export async function dbListActiveTemplates() {
  const database = await db();
  const rows = await database
    .select()
    .from(letterTemplates)
    .where(eq(letterTemplates.active, true))
    .orderBy(asc(letterTemplates.sortOrder), asc(letterTemplates.id));
  return rows.map(({ contextualNotes, ...safe }) => safe);
}

export async function dbGetTemplateById(id: number, includeContextualNotes: boolean) {
  const database = await db();
  const conditions = includeContextualNotes
    ? eq(letterTemplates.id, id)
    : and(eq(letterTemplates.id, id), eq(letterTemplates.active, true));
  const rows = await database
    .select()
    .from(letterTemplates)
    .where(conditions)
    .limit(1);
  if (!rows.length) throw new TRPCError({ code: "NOT_FOUND", message: "Template not found" });
  const template = rows[0];
  if (!includeContextualNotes) {
    const { contextualNotes, ...safeTemplate } = template;
    return safeTemplate;
  }
  return template;
}

export async function dbListAllTemplates() {
  const database = await db();
  return database
    .select()
    .from(letterTemplates)
    .orderBy(asc(letterTemplates.sortOrder), asc(letterTemplates.id));
}

export async function dbCreateTemplate(input: {
  title: string;
  scenarioDescription: string;
  category: string;
  tags: string[];
  letterType: string;
  prefillData: Record<string, unknown>;
  active: boolean;
  sortOrder: number;
  contextualNotes?: string | null;
}) {
  const database = await db();
  const result = await database
    .insert(letterTemplates)
    .values({
      title: input.title,
      scenarioDescription: input.scenarioDescription,
      category: input.category,
      tags: input.tags,
      letterType: input.letterType as LetterType,
      prefillData: input.prefillData,
      active: input.active,
      sortOrder: input.sortOrder,
      contextualNotes: input.contextualNotes ?? null,
    })
    .returning();
  return result[0];
}

export async function dbUpdateTemplate(id: number, updates: {
  title?: string;
  scenarioDescription?: string;
  category?: string;
  tags?: string[];
  letterType?: string;
  prefillData?: Record<string, unknown>;
  active?: boolean;
  sortOrder?: number;
  contextualNotes?: string | null;
}) {
  const database = await db();
  const result = await database
    .update(letterTemplates)
    .set({ ...updates, letterType: updates.letterType as LetterType | undefined, updatedAt: new Date() })
    .where(eq(letterTemplates.id, id))
    .returning();
  if (!result.length) throw new TRPCError({ code: "NOT_FOUND", message: "Template not found" });
  return result[0];
}

export async function dbToggleTemplateActive(id: number, active: boolean) {
  const database = await db();
  const result = await database
    .update(letterTemplates)
    .set({ active, updatedAt: new Date() })
    .where(eq(letterTemplates.id, id))
    .returning();
  if (!result.length) throw new TRPCError({ code: "NOT_FOUND", message: "Template not found" });
  return result[0];
}

export async function dbDeleteTemplate(id: number) {
  const database = await db();
  const result = await database
    .delete(letterTemplates)
    .where(eq(letterTemplates.id, id))
    .returning({ id: letterTemplates.id });
  if (!result.length) throw new TRPCError({ code: "NOT_FOUND", message: "Template not found" });
  return { success: true };
}
