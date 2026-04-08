import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  dbListIntakeFormTemplates,
  dbGetIntakeFormTemplateById,
  dbCountActiveIntakeFormTemplates,
  dbCreateIntakeFormTemplate,
  dbUpdateIntakeFormTemplate,
  dbDeleteIntakeFormTemplate,
} from "../db/intake-form-templates";

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
    return dbListIntakeFormTemplates(ctx.user.id);
  }),

  getById: subscriberProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const template = await dbGetIntakeFormTemplateById(input.id, ctx.user.id);
      if (!template) throw new TRPCError({ code: "NOT_FOUND", message: "Template not found" });
      return template;
    }),

  create: subscriberProcedure
    .input(templateInputSchema)
    .mutation(async ({ input, ctx }) => {
      const count = await dbCountActiveIntakeFormTemplates(ctx.user.id);
      if (count >= 20) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Maximum of 20 intake form templates allowed" });
      }
      const template = await dbCreateIntakeFormTemplate({
        ownerUserId: ctx.user.id,
        title: input.title,
        baseLetterType: input.baseLetterType,
        fieldConfig: input.fieldConfig,
      });
      if (!template) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      return template;
    }),

  update: subscriberProcedure
    .input(z.object({ id: z.number() }).merge(templateInputSchema.partial()))
    .mutation(async ({ input, ctx }) => {
      const { id, ...updates } = input;
      const template = await dbUpdateIntakeFormTemplate(id, ctx.user.id, updates);
      if (!template) throw new TRPCError({ code: "NOT_FOUND", message: "Template not found" });
      return template;
    }),

  delete: subscriberProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const deleted = await dbDeleteIntakeFormTemplate(input.id, ctx.user.id);
      if (!deleted) throw new TRPCError({ code: "NOT_FOUND", message: "Template not found" });
      return { success: true };
    }),
});
