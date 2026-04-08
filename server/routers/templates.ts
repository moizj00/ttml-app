import { z } from "zod";
import { adminProcedure, protectedProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import {
  dbListActiveTemplates,
  dbGetTemplateById,
  dbListAllTemplates,
  dbCreateTemplate,
  dbUpdateTemplate,
  dbToggleTemplateActive,
  dbDeleteTemplate,
} from "../db";

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
  enabledSituationFields: z.array(z.string()).optional(),
  customSituationFields: z.array(situationFieldDefSchema).optional(),
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
    return dbListActiveTemplates();
  }),

  getById: subscriberProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const isAdmin = ctx.user.role === "admin";
      return dbGetTemplateById(input.id, isAdmin);
    }),

  listAll: adminProcedure.query(async () => {
    return dbListAllTemplates();
  }),

  create: adminProcedure
    .input(templateInputSchema)
    .mutation(async ({ input }) => {
      return dbCreateTemplate(input as Parameters<typeof dbCreateTemplate>[0]);
    }),

  update: adminProcedure
    .input(z.object({ id: z.number() }).merge(templateInputSchema.partial()))
    .mutation(async ({ input }) => {
      const { id, ...updates } = input;
      return dbUpdateTemplate(id, updates as Parameters<typeof dbUpdateTemplate>[1]);
    }),

  toggleActive: adminProcedure
    .input(z.object({ id: z.number(), active: z.boolean() }))
    .mutation(async ({ input }) => {
      return dbToggleTemplateActive(input.id, input.active);
    }),

  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      return dbDeleteTemplate(input.id);
    }),
});
