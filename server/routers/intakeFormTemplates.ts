import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { eq, and, asc } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db/core";
import { intakeFormTemplates } from "../../drizzle/schema";

const subscriberProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "subscriber" && ctx.user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
  }
  return next({ ctx });
});

const situationFieldDefSchema = z.object({
  key: z.string().min(1).max(100),
  label: z.string().min(1).max(200),
  type: z.enum(["text", "textarea", "number", "date", "select"]),
  placeholder: z.string().optional(),
  options: z.array(z.string()).optional(),
  defaultEnabled: z.boolean().default(true),
}).refine(
  (data) => data.type !== "select" || (data.options && data.options.length > 0),
  { message: "Select fields must have at least one option" }
);

const fieldConfigSchema = z.object({
  enabledDefaultFields: z.array(z.string()).default([]),
  customFields: z.array(situationFieldDefSchema).default([]),
});

const templateInputSchema = z.object({
  title: z.string().min(3).max(200),
  baseLetterType: z.enum([
    "demand-letter", "cease-and-desist", "contract-breach", "eviction-notice",
    "employment-dispute", "consumer-complaint", "general-legal",
    "pre-litigation-settlement", "debt-collection", "estate-probate",
    "landlord-tenant", "insurance-dispute", "personal-injury-demand",
    "intellectual-property", "family-law", "neighbor-hoa",
  ]),
  fieldConfig: fieldConfigSchema,
});

export const intakeFormTemplatesRouter = router({
  list: subscriberProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    return db
      .select()
      .from(intakeFormTemplates)
      .where(
        and(
          eq(intakeFormTemplates.ownerUserId, ctx.user.id),
          eq(intakeFormTemplates.active, true),
        )
      )
      .orderBy(asc(intakeFormTemplates.id));
  }),

  getById: subscriberProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const rows = await db
        .select()
        .from(intakeFormTemplates)
        .where(
          and(
            eq(intakeFormTemplates.id, input.id),
            eq(intakeFormTemplates.ownerUserId, ctx.user.id),
          )
        )
        .limit(1);
      if (!rows.length) throw new TRPCError({ code: "NOT_FOUND", message: "Template not found" });
      return rows[0];
    }),

  create: subscriberProcedure
    .input(templateInputSchema)
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const existing = await db
        .select({ id: intakeFormTemplates.id })
        .from(intakeFormTemplates)
        .where(
          and(
            eq(intakeFormTemplates.ownerUserId, ctx.user.id),
            eq(intakeFormTemplates.active, true),
          )
        );
      if (existing.length >= 20) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Maximum of 20 intake form templates allowed" });
      }
      const result = await db
        .insert(intakeFormTemplates)
        .values({
          ownerUserId: ctx.user.id,
          title: input.title,
          baseLetterType: input.baseLetterType,
          fieldConfig: input.fieldConfig,
        })
        .returning();
      return result[0];
    }),

  update: subscriberProcedure
    .input(z.object({ id: z.number() }).merge(templateInputSchema.partial()))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const { id, ...updates } = input;
      const result = await db
        .update(intakeFormTemplates)
        .set({
          ...(updates.title !== undefined && { title: updates.title }),
          ...(updates.baseLetterType !== undefined && { baseLetterType: updates.baseLetterType }),
          ...(updates.fieldConfig !== undefined && { fieldConfig: updates.fieldConfig }),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(intakeFormTemplates.id, id),
            eq(intakeFormTemplates.ownerUserId, ctx.user.id),
          )
        )
        .returning();
      if (!result.length) throw new TRPCError({ code: "NOT_FOUND", message: "Template not found" });
      return result[0];
    }),

  delete: subscriberProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const result = await db
        .update(intakeFormTemplates)
        .set({ active: false, updatedAt: new Date() })
        .where(
          and(
            eq(intakeFormTemplates.id, input.id),
            eq(intakeFormTemplates.ownerUserId, ctx.user.id),
          )
        )
        .returning({ id: intakeFormTemplates.id });
      if (!result.length) throw new TRPCError({ code: "NOT_FOUND", message: "Template not found" });
      return { success: true };
    }),
});
