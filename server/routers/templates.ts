import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { eq, asc, and } from "drizzle-orm";
import { adminProcedure, protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db/core";
import { letterTemplates, letterTypeEnum } from "../../drizzle/schema";

type LetterType = (typeof letterTypeEnum.enumValues)[number];

const subscriberProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "subscriber" && ctx.user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
  }
  return next({ ctx });
});

const prefillDataSchema = z.object({
  subject: z.string().optional(),
  description: z.string().optional(),
  desiredOutcome: z.string().optional(),
  tonePreference: z.enum(["firm", "moderate", "aggressive"]).optional(),
  amountOwed: z.string().optional(),
  letterType: z.string().optional(),
  jurisdictionState: z.string().optional(),
  jurisdictionCity: z.string().optional(),
  additionalContext: z.string().optional(),
});

const templateInputSchema = z.object({
  title: z.string().min(3).max(200),
  scenarioDescription: z.string().min(10),
  category: z.string().min(2).max(100),
  tags: z.array(z.string()).default([]),
  letterType: z.enum([
    "demand-letter", "cease-and-desist", "contract-breach", "eviction-notice",
    "employment-dispute", "consumer-complaint", "general-legal",
    "pre-litigation-settlement", "debt-collection", "estate-probate",
    "landlord-tenant", "insurance-dispute", "personal-injury-demand",
    "intellectual-property", "family-law", "neighbor-hoa",
  ]),
  prefillData: prefillDataSchema,
  active: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
  contextualNotes: z.string().nullable().optional(),
});

export const templatesRouter = router({
  listActive: subscriberProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    const rows = await db
      .select()
      .from(letterTemplates)
      .where(eq(letterTemplates.active, true))
      .orderBy(asc(letterTemplates.sortOrder), asc(letterTemplates.id));
    return rows.map(({ contextualNotes, ...safe }) => safe);
  }),

  getById: subscriberProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const isAdmin = ctx.user.role === "admin";
      const conditions = isAdmin
        ? eq(letterTemplates.id, input.id)
        : and(eq(letterTemplates.id, input.id), eq(letterTemplates.active, true));
      const rows = await db
        .select()
        .from(letterTemplates)
        .where(conditions)
        .limit(1);
      if (!rows.length) throw new TRPCError({ code: "NOT_FOUND", message: "Template not found" });
      const template = rows[0];
      if (!isAdmin) {
        const { contextualNotes, ...safeTemplate } = template;
        return safeTemplate;
      }
      return template;
    }),

  listAll: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    return db
      .select()
      .from(letterTemplates)
      .orderBy(asc(letterTemplates.sortOrder), asc(letterTemplates.id));
  }),

  create: adminProcedure
    .input(templateInputSchema)
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const result = await db
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
    }),

  update: adminProcedure
    .input(z.object({ id: z.number() }).merge(templateInputSchema.partial()))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const { id, ...updates } = input;
      const result = await db
        .update(letterTemplates)
        .set({ ...updates, letterType: updates.letterType as LetterType | undefined, updatedAt: new Date() })
        .where(eq(letterTemplates.id, id))
        .returning();
      if (!result.length) throw new TRPCError({ code: "NOT_FOUND", message: "Template not found" });
      return result[0];
    }),

  toggleActive: adminProcedure
    .input(z.object({ id: z.number(), active: z.boolean() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const result = await db
        .update(letterTemplates)
        .set({ active: input.active, updatedAt: new Date() })
        .where(eq(letterTemplates.id, input.id))
        .returning();
      if (!result.length) throw new TRPCError({ code: "NOT_FOUND", message: "Template not found" });
      return result[0];
    }),

  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const result = await db
        .delete(letterTemplates)
        .where(eq(letterTemplates.id, input.id))
        .returning({ id: letterTemplates.id });
      if (!result.length) throw new TRPCError({ code: "NOT_FOUND", message: "Template not found" });
      return { success: true };
    }),
});
