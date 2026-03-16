import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { checkTrpcRateLimit } from "./rateLimiter";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import {
  adminProcedure,
  protectedProcedure,
  publicProcedure,
  router,
} from "./_core/trpc";
import {
  claimLetterForReview,
  createAttachment,
  createLetterRequest,
  createLetterVersion,
  createNotification,
  getAllLetterRequests,
  getAllUsers,
  getAttachmentsByLetterId,
  getEmployees,
  getFailedJobs,
  getLetterRequestById,
  getLetterRequestSafeForSubscriber,
  getLetterRequestsByUserId,
  getLetterVersionById,
  getLetterVersionsByRequestId,
  getNotificationsByUserId,
  getResearchRunsByLetterId,
  getReviewActions,
  getSystemStats,
  getWorkflowJobsByLetterId,
  logReviewAction,
  markAllNotificationsRead,
  markNotificationRead,
  updateLetterStatus,
  updateLetterVersionPointers,
  updateUserRole,
  updateUserProfile,
  getUserById,
  getUserByEmail,
  deleteUserVerificationTokens,
  createEmailVerificationToken,
  purgeFailedJobs,
  updateLetterPdfUrl,
  archiveLetterRequest,
  createDiscountCodeForEmployee,
  getDiscountCodeByEmployeeId,
  getDiscountCodeByCode,
  getAllDiscountCodes,
  updateDiscountCode,
  getCommissionsByEmployeeId,
  getEmployeeEarningsSummary,
  getAllCommissions,
  markCommissionsPaid,
  createPayoutRequest,
  getPayoutRequestsByEmployeeId,
  getAllPayoutRequests,
  processPayoutRequest,
  getPayoutRequestById,
  getAllEmployeeEarnings,
  markPriorPipelineRunsSuperseded,
} from "./db";
import {
  sendJobFailedAlertEmail,
  sendLetterApprovedEmail,
  sendLetterRejectedEmail,
  sendNeedsChangesEmail,
  sendNewReviewNeededEmail,
  sendLetterSubmissionEmail,
  sendLetterUnlockedEmail,
  sendStatusUpdateEmail,
  sendVerificationEmail,
  sendReviewAssignedEmail,
} from "./email";
import { runFullPipeline, retryPipelineFromStage } from "./pipeline";
import { generateAndUploadApprovedPdf } from "./pdfGenerator";
import { storagePut } from "./storage";
import { invalidateUserCache } from "./supabaseAuth";
import {
  createCheckoutSession,
  createBillingPortalSession,
  createLetterUnlockCheckout,
  createTrialReviewCheckout,
  getUserSubscription,
  checkLetterSubmissionAllowed,
  hasActiveRecurringSubscription,
} from "./stripe";

// ─── Role Guards ──────────────────────────────────────────────────────────────

const employeeProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "employee" && ctx.user.role !== "admin") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Employee or Admin access required",
    });
  }
  return next({ ctx });
});

const attorneyProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "attorney" && ctx.user.role !== "admin") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Attorney or Admin access required",
    });
  }
  return next({ ctx });
});

const subscriberProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "subscriber") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Subscriber access required",
    });
  }
  return next({ ctx });
});

function getAppUrl(req: {
  protocol: string;
  headers: Record<string, string | string[] | undefined>;
}): string {
  const host = req.headers["x-forwarded-host"] ?? req.headers.host;
  if (host && !String(host).includes("localhost")) {
    const proto = req.headers["x-forwarded-proto"] ?? req.protocol ?? "https";
    return `${proto}://${host}`;
  }
  return "https://www.talk-to-my-lawyer.com";
}

// ═══════════════════════════════════════════════════════
// MAIN ROUTER
// ═══════════════════════════════════════════════════════

export const appRouter = router({
  system: systemRouter,

  // ─── Auth ──────────────────────────────────────────────────────────────────
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie("sb_session", { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),

    completeOnboarding: protectedProcedure
      .input(
        z.object({
          // Attorney role is NOT self-assignable — it can only be granted by a super admin
          role: z.enum(["subscriber", "employee"]),
          jurisdiction: z.string().optional(),
          companyName: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const userId = ctx.user.id;
        // Update user role
        await updateUserRole(userId, input.role);
        // If employee, auto-generate discount code
        if (input.role === "employee") {
          try {
            await createDiscountCodeForEmployee(
              userId,
              ctx.user.name || "affiliate"
            );
          } catch (e) {
            // Discount code may already exist if user re-onboards
            console.log(
              "[Onboarding] Discount code creation skipped (may already exist)",
              e
            );
          }
        }
        const roleLabels: Record<string, string> = {
          subscriber: "Your account is ready. Start submitting legal letters!",
          employee:
            "Your affiliate account is set up with a unique discount code.",
        };
        return {
          success: true,
          role: input.role,
          message: roleLabels[input.role] || "Account set up!",
        };
      }),
  }),

  // ─── Subscriber: Letter Requests ───────────────────────────────────────────
  letters: router({
    submit: subscriberProcedure
      .input(
        z.object({
          letterType: z.enum([
            "demand-letter",
            "cease-and-desist",
            "contract-breach",
            "eviction-notice",
            "employment-dispute",
            "consumer-complaint",
            "general-legal",
          ]),
          subject: z.string().min(5).max(500),
          issueSummary: z.string().optional(),
          jurisdictionCountry: z.string().default("US"),
          jurisdictionState: z.string().min(2),
          jurisdictionCity: z.string().optional(),
          intakeJson: z.object({
            schemaVersion: z.string().default("1.0"),
            letterType: z.string(),
            sender: z.object({
              name: z.string(),
              address: z.string(),
              email: z.string().optional(),
              phone: z.string().optional(),
            }),
            recipient: z.object({
              name: z.string(),
              address: z.string(),
              email: z.string().optional(),
              phone: z.string().optional(),
            }),
            jurisdiction: z.object({
              country: z.string(),
              state: z.string(),
              city: z.string().optional(),
            }),
            matter: z.object({
              category: z.string(),
              subject: z.string(),
              description: z.string(),
              incidentDate: z.string().optional(),
            }),
            financials: z
              .object({
                amountOwed: z.number().optional(),
                currency: z.string().optional(),
              })
              .optional(),
            desiredOutcome: z.string(),
            deadlineDate: z.string().optional(),
            additionalContext: z.string().optional(),
            tonePreference: z
              .enum(["firm", "moderate", "aggressive"])
              .optional(),
            language: z.string().optional(),
            priorCommunication: z.string().optional(),
            deliveryMethod: z.string().optional(),
            communications: z
              .object({
                summary: z.string(),
                lastContactDate: z.string().optional(),
                method: z
                  .enum(["email", "phone", "letter", "in-person", "other"])
                  .optional(),
              })
              .optional(),
            toneAndDelivery: z
              .object({
                tone: z.enum(["firm", "moderate", "aggressive"]),
                deliveryMethod: z
                  .enum(["email", "certified-mail", "hand-delivery"])
                  .optional(),
              })
              .optional(),
          }),
          priority: z
            .enum(["low", "normal", "high", "urgent"])
            .default("normal"),
        })
      )
      .mutation(async ({ ctx, input }) => {
        // Rate limit: 5 letter submissions per hour per user
        await checkTrpcRateLimit("letter", `user:${ctx.user.id}`);
        const result = await createLetterRequest({
          userId: ctx.user.id,
          letterType: input.letterType,
          subject: input.subject,
          issueSummary: input.issueSummary,
          jurisdictionCountry: input.jurisdictionCountry,
          jurisdictionState: input.jurisdictionState,
          jurisdictionCity: input.jurisdictionCity,
          intakeJson: input.intakeJson,
          priority: input.priority,
        });
        const letterId = (result as any)?.insertId;

        await logReviewAction({
          letterRequestId: letterId,
          reviewerId: ctx.user.id,
          actorType: "subscriber",
          action: "letter_submitted",
          fromStatus: undefined,
          toStatus: "submitted",
        });

        // Send submission confirmation email (non-blocking)
        const appUrl = getAppUrl(ctx.req);
        if (ctx.user.email)
          sendLetterSubmissionEmail({
            to: ctx.user.email,
            name: ctx.user.name ?? "Subscriber",
            subject: input.subject,
            letterId,
            letterType: input.letterType,
            jurisdictionState: input.jurisdictionState,
            appUrl,
          }).catch(err =>
            console.error("[Email] Submission confirmation failed:", err)
          );

        // Trigger AI pipeline in background (non-blocking)
        runFullPipeline(letterId, input.intakeJson as any).catch(async err => {
          console.error("[Pipeline] Failed:", err);
          try {
            const admins = await getAllUsers("admin");
            const appUrl = getAppUrl(ctx.req);
            for (const admin of admins) {
              if (admin.email) {
                await sendJobFailedAlertEmail({
                  to: admin.email,
                  name: admin.name ?? "Admin",
                  letterId,
                  jobType: "generation_pipeline",
                  errorMessage:
                    err instanceof Error ? err.message : String(err),
                  appUrl,
                });
              }
              await createNotification({
                userId: admin.id,
                type: "job_failed",
                title: `Pipeline failed for letter #${letterId}`,
                body: err instanceof Error ? err.message : String(err),
                link: `/admin/jobs`,
              });
            }
          } catch (notifyErr) {
            console.error("[Pipeline] Failed to notify admins:", notifyErr);
          }
        });

        return { letterId, status: "submitted" };
      }),

    myLetters: subscriberProcedure.query(async ({ ctx }) => {
      return getLetterRequestsByUserId(ctx.user.id);
    }),

    detail: subscriberProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const letter = await getLetterRequestSafeForSubscriber(
          input.id,
          ctx.user.id
        );
        if (!letter)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Letter not found",
          });
        const actions = await getReviewActions(input.id, false);
        const versions = await getLetterVersionsByRequestId(input.id, false);
        const attachmentList = await getAttachmentsByLetterId(input.id);
        return { letter, actions, versions, attachments: attachmentList };
      }),

    updateForChanges: subscriberProcedure
      .input(
        z.object({
          letterId: z.number(),
          additionalContext: z.string().min(10),
          updatedIntakeJson: z.any().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const letter = await getLetterRequestById(input.letterId);
        if (!letter || letter.userId !== ctx.user.id)
          throw new TRPCError({ code: "NOT_FOUND" });
        if (letter.status !== "needs_changes")
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Letter must be in needs_changes status",
          });

        // Log the subscriber's response
        await logReviewAction({
          letterRequestId: input.letterId,
          reviewerId: ctx.user.id,
          actorType: "subscriber",
          action: "subscriber_updated",
          noteText: input.additionalContext,
          noteVisibility: "user_visible",
          fromStatus: "needs_changes",
          toStatus: "submitted",
        });

        // If updated intake provided, update the letter request
        if (input.updatedIntakeJson) {
          const db = await (await import("./db")).getDb();
          if (db) {
            const { letterRequests } = await import("../drizzle/schema");
            const { eq } = await import("drizzle-orm");
            await db
              .update(letterRequests)
              .set({
                intakeJson: input.updatedIntakeJson,
                updatedAt: new Date(),
              } as any)
              .where(eq(letterRequests.id, input.letterId));
          }
        }

        // Mark prior pipeline runs as superseded before starting fresh
        await markPriorPipelineRunsSuperseded(input.letterId);

        // Transition status back to submitted before re-triggering pipeline
        // This allows the pipeline to properly set researching → drafting → generated_locked
        await updateLetterStatus(input.letterId, "submitted");

        // Re-trigger full pipeline (not just from drafting — subscriber changes may affect research)
        const intake = input.updatedIntakeJson ?? letter.intakeJson;
        if (intake) {
          const appUrl = getAppUrl(ctx.req);
          runFullPipeline(input.letterId, intake as any).catch(async err => {
            console.error(
              "[Pipeline] Retry after subscriber update failed:",
              err
            );
            try {
              const admins = await getAllUsers("admin");
              for (const admin of admins) {
                if (admin.email) {
                  await sendJobFailedAlertEmail({
                    to: admin.email,
                    name: admin.name ?? "Admin",
                    letterId: input.letterId,
                    jobType: "generation_pipeline",
                    errorMessage:
                      err instanceof Error ? err.message : String(err),
                    appUrl,
                  });
                }
              }
            } catch (notifyErr) {
              console.error("[Pipeline] Failed to notify admins:", notifyErr);
            }
          });
        }

        return { success: true };
      }),

    retryFromRejected: subscriberProcedure
      .input(
        z.object({
          letterId: z.number(),
          additionalContext: z.string().min(10).optional(),
          updatedIntakeJson: z.any().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const letter = await getLetterRequestById(input.letterId);
        if (!letter || letter.userId !== ctx.user.id)
          throw new TRPCError({ code: "NOT_FOUND" });
        if (letter.status !== "rejected")
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Letter must be in rejected status to retry",
          });

        await logReviewAction({
          letterRequestId: input.letterId,
          reviewerId: ctx.user.id,
          actorType: "subscriber",
          action: "retry_from_rejected",
          noteText: input.additionalContext ?? "Subscriber retrying after rejection",
          noteVisibility: "user_visible",
          fromStatus: "rejected",
          toStatus: "submitted",
        });

        if (input.updatedIntakeJson) {
          const db = await (await import("./db")).getDb();
          if (db) {
            const { letterRequests } = await import("../drizzle/schema");
            const { eq } = await import("drizzle-orm");
            await db
              .update(letterRequests)
              .set({
                intakeJson: input.updatedIntakeJson,
                updatedAt: new Date(),
              } as any)
              .where(eq(letterRequests.id, input.letterId));
          }
        }

        const intake = input.updatedIntakeJson ?? letter.intakeJson;
        if (!intake) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "No intake data available to re-run the pipeline. Please provide updated details.",
          });
        }

        await markPriorPipelineRunsSuperseded(input.letterId);
        await updateLetterStatus(input.letterId, "submitted");

        const appUrl = getAppUrl(ctx.req);
        runFullPipeline(input.letterId, intake as any).catch(async err => {
          console.error(
            "[Pipeline] Retry after rejection failed:",
            err
          );
          try {
            const admins = await getAllUsers("admin");
            for (const admin of admins) {
              if (admin.email) {
                await sendJobFailedAlertEmail({
                  to: admin.email,
                  name: admin.name ?? "Admin",
                  letterId: input.letterId,
                  jobType: "generation_pipeline",
                  errorMessage:
                    err instanceof Error ? err.message : String(err),
                  appUrl,
                });
              }
            }
          } catch (notifyErr) {
            console.error("[Pipeline] Failed to notify admins:", notifyErr);
          }
        });

        return { success: true };
      }),

    archive: subscriberProcedure
      .input(z.object({ letterId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const letter = await getLetterRequestById(input.letterId);
        if (!letter || letter.userId !== ctx.user.id)
          throw new TRPCError({ code: "NOT_FOUND" });
        if (!["approved", "rejected"].includes(letter.status))
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Only completed letters can be archived",
          });
        await archiveLetterRequest(input.letterId, ctx.user.id);
        return { success: true };
      }),

    uploadAttachment: subscriberProcedure
      .input(
        z.object({
          letterId: z.number(),
          fileName: z.string(),
          mimeType: z.string(),
          base64Data: z.string(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const letter = await getLetterRequestById(input.letterId);
        if (!letter || letter.userId !== ctx.user.id)
          throw new TRPCError({ code: "NOT_FOUND" });
        const buffer = Buffer.from(input.base64Data, "base64");
        // Strip path separators and non-safe chars to prevent path traversal
        const safeName =
          input.fileName
            .replace(/[/\\]/g, "_")
            .replace(/[^a-zA-Z0-9._\-]/g, "_")
            .slice(0, 200) || "attachment";
        const key = `attachments/${ctx.user.id}/${input.letterId}/${Date.now()}-${safeName}`;
        const { url } = await storagePut(key, buffer, input.mimeType);
        await createAttachment({
          letterRequestId: input.letterId,
          uploadedByUserId: ctx.user.id,
          storagePath: key,
          storageUrl: url,
          fileName: input.fileName,
          mimeType: input.mimeType,
          sizeBytes: buffer.length,
        });
        return { url, key };
      }),
  }),

  // ─── Employee/Attorney: Review Center ─────────────────────────────────────
  review: router({
    queue: attorneyProcedure
      .input(
        z
          .object({
            status: z.string().optional(),
            unassigned: z.boolean().optional(),
            myAssigned: z.boolean().optional(),
          })
          .optional()
      )
      .query(async ({ ctx, input }) => {
        if (input?.myAssigned)
          return getAllLetterRequests({ assignedReviewerId: ctx.user.id });
        return getAllLetterRequests({
          status: input?.status,
          unassigned: input?.unassigned,
        });
      }),

    letterDetail: attorneyProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const letter = await getLetterRequestById(input.id);
        if (!letter) throw new TRPCError({ code: "NOT_FOUND" });
        // Admins can always view.
        // Attorneys can view if:
        //   (a) they are the assigned reviewer, OR
        //   (b) the letter is pending_review (unassigned — available to claim)
        const canView =
          ctx.user.role === "admin" ||
          letter.assignedReviewerId === ctx.user.id ||
          letter.status === "pending_review";
        if (!canView)
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You are not assigned to this letter",
          });
        const versions = await getLetterVersionsByRequestId(input.id, true);
        const actions = await getReviewActions(input.id, true);
        const jobs = await getWorkflowJobsByLetterId(input.id);
        const research = await getResearchRunsByLetterId(input.id);
        const attachmentList = await getAttachmentsByLetterId(input.id);
        return {
          letter,
          versions,
          actions,
          jobs,
          research,
          attachments: attachmentList,
        };
      }),

    claim: attorneyProcedure
      .input(z.object({ letterId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const letter = await getLetterRequestById(input.letterId);
        if (!letter) throw new TRPCError({ code: "NOT_FOUND" });
        if (!["pending_review", "under_review"].includes(letter.status))
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Letter is not in a reviewable state",
          });
        await claimLetterForReview(input.letterId, ctx.user.id);
        await logReviewAction({
          letterRequestId: input.letterId,
          reviewerId: ctx.user.id,
          actorType: ctx.user.role as any,
          action: "claimed_for_review",
          fromStatus: letter.status,
          toStatus: "under_review",
        });
        // ── Notify subscriber: letter is now under attorney review ──
        try {
          const subscriber = await getUserById(letter.userId);
          const appUrl = getAppUrl(ctx.req);
          if (subscriber?.email) {
            await sendStatusUpdateEmail({
              to: subscriber.email,
              name: subscriber.name ?? "Subscriber",
              subject: letter.subject,
              letterId: input.letterId,
              newStatus: "under_review",
              appUrl,
            });
          }
          await createNotification({
            userId: letter.userId,
            type: "letter_under_review",
            title: "Your letter is being reviewed",
            body: `An attorney has claimed your letter "${letter.subject}" and is currently reviewing it.`,
            link: `/letters/${input.letterId}`,
          });
        } catch (err) {
          console.error("[Notify] Claim subscriber notification failed:", err);
        }
        // ── Notify attorney: review assignment confirmation ──
        try {
          const attorney = await getUserById(ctx.user.id);
          const appUrl = getAppUrl(ctx.req);
          const subscriber = await getUserById(letter.userId);
          if (attorney?.email) {
            const jurisdiction =
              [
                letter.jurisdictionCity,
                letter.jurisdictionState,
                letter.jurisdictionCountry,
              ]
                .filter(Boolean)
                .join(", ") || "Not specified";
            await sendReviewAssignedEmail({
              to: attorney.email,
              name: attorney.name ?? "Attorney",
              letterSubject: letter.subject,
              letterId: input.letterId,
              letterType: letter.letterType,
              jurisdiction,
              subscriberName: subscriber?.name ?? "Subscriber",
              appUrl,
            });
          }
        } catch (err) {
          console.error("[Notify] Claim attorney notification failed:", err);
        }
        return { success: true };
      }),

    approve: attorneyProcedure
      .input(
        z.object({
          letterId: z.number(),
          finalContent: z.string().min(50),
          internalNote: z.string().optional(),
          userVisibleNote: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const letter = await getLetterRequestById(input.letterId);
        if (!letter) throw new TRPCError({ code: "NOT_FOUND" });
        if (
          ctx.user.role !== "admin" &&
          letter.assignedReviewerId !== ctx.user.id
        )
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You are not assigned to this letter",
          });
        if (letter.status !== "under_review")
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Letter must be under_review to approve",
          });
        const version = await createLetterVersion({
          letterRequestId: input.letterId,
          versionType: "final_approved",
          content: input.finalContent,
          createdByType: ctx.user.role as any,
          createdByUserId: ctx.user.id,
          metadataJson: {
            approvedBy: ctx.user.name,
            approvedAt: new Date().toISOString(),
          },
        });
        const versionId = (version as any)?.insertId;
        await updateLetterVersionPointers(input.letterId, {
          currentFinalVersionId: versionId,
        });
        await updateLetterStatus(input.letterId, "approved");
        await logReviewAction({
          letterRequestId: input.letterId,
          reviewerId: ctx.user.id,
          actorType: ctx.user.role as any,
          action: "approved",
          noteText: input.internalNote,
          noteVisibility: "internal",
          fromStatus: "under_review",
          toStatus: "approved",
        });
        if (input.userVisibleNote) {
          await logReviewAction({
            letterRequestId: input.letterId,
            reviewerId: ctx.user.id,
            actorType: ctx.user.role as any,
            action: "attorney_note",
            noteText: input.userVisibleNote,
            noteVisibility: "user_visible",
          });
        }
        // ── Generate PDF, upload to S3, store URL ──
        let pdfUrl: string | undefined;
        try {
          const pdfResult = await generateAndUploadApprovedPdf({
            letterId: input.letterId,
            letterType: letter.letterType,
            subject: letter.subject,
            content: input.finalContent,
            approvedBy: ctx.user.name ?? undefined,
            approvedAt: new Date().toISOString(),
            jurisdictionState: letter.jurisdictionState,
            jurisdictionCountry: letter.jurisdictionCountry,
            intakeJson: letter.intakeJson as any,
          });
          pdfUrl = pdfResult.pdfUrl;
          await updateLetterPdfUrl(input.letterId, pdfUrl);
          console.log(
            `[Approve] PDF generated for letter #${input.letterId}: ${pdfUrl}`
          );
        } catch (pdfErr) {
          console.error(
            `[Approve] PDF generation failed for letter #${input.letterId}:`,
            pdfErr
          );
          // Non-blocking: approval still succeeds even if PDF fails
        }
        // ── Notify subscriber with PDF link ──
        try {
          const appUrl = getAppUrl(ctx.req);
          const subscriber = await getUserById(letter.userId);
          if (subscriber?.email) {
            await sendLetterApprovedEmail({
              to: subscriber.email,
              name: subscriber.name ?? "Subscriber",
              subject: letter.subject,
              letterId: input.letterId,
              appUrl,
              pdfUrl,
            });
          }
          await createNotification({
            userId: letter.userId,
            type: "letter_approved",
            title: "Your letter has been approved!",
            body: `Your letter "${letter.subject}" is ready to download.${pdfUrl ? " A PDF copy is available." : ""}`,
            link: `/letters/${input.letterId}`,
          });
        } catch (err) {
          console.error("[Notify] Failed:", err);
        }
        return { success: true, versionId, pdfUrl };
      }),

    reject: attorneyProcedure
      .input(
        z.object({
          letterId: z.number(),
          reason: z.string().min(10),
          userVisibleReason: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const letter = await getLetterRequestById(input.letterId);
        if (!letter) throw new TRPCError({ code: "NOT_FOUND" });
        if (
          ctx.user.role !== "admin" &&
          letter.assignedReviewerId !== ctx.user.id
        )
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You are not assigned to this letter",
          });
        if (letter.status !== "under_review")
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Letter must be under_review to reject",
          });
        await updateLetterStatus(input.letterId, "rejected");
        await logReviewAction({
          letterRequestId: input.letterId,
          reviewerId: ctx.user.id,
          actorType: ctx.user.role as any,
          action: "rejected",
          noteText: input.reason,
          noteVisibility: "internal",
          fromStatus: "under_review",
          toStatus: "rejected",
        });
        const visibleReason = input.userVisibleReason ?? input.reason;
        await logReviewAction({
          letterRequestId: input.letterId,
          reviewerId: ctx.user.id,
          actorType: ctx.user.role as any,
          action: "rejection_notice",
          noteText: visibleReason,
          noteVisibility: "user_visible",
        });
        try {
          const appUrl = getAppUrl(ctx.req);
          const subscriber = await getUserById(letter.userId);
          if (subscriber?.email) {
            await sendLetterRejectedEmail({
              to: subscriber.email,
              name: subscriber.name ?? "Subscriber",
              subject: letter.subject,
              letterId: input.letterId,
              reason: visibleReason,
              appUrl,
            });
          }
          await createNotification({
            userId: letter.userId,
            type: "letter_rejected",
            title: "Update on your letter request",
            body: visibleReason,
            link: `/letters/${input.letterId}`,
          });
        } catch (err) {
          console.error("[Notify] Failed:", err);
        }
        return { success: true };
      }),

    requestChanges: attorneyProcedure
      .input(
        z.object({
          letterId: z.number(),
          internalNote: z.string().optional(),
          userVisibleNote: z.string().min(10),
          retriggerPipeline: z.boolean().default(false),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const letter = await getLetterRequestById(input.letterId);
        if (!letter) throw new TRPCError({ code: "NOT_FOUND" });
        if (
          ctx.user.role !== "admin" &&
          letter.assignedReviewerId !== ctx.user.id
        )
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You are not assigned to this letter",
          });
        if (letter.status !== "under_review")
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Letter must be under_review",
          });
        await updateLetterStatus(input.letterId, "needs_changes");
        await logReviewAction({
          letterRequestId: input.letterId,
          reviewerId: ctx.user.id,
          actorType: ctx.user.role as any,
          action: "requested_changes",
          noteText: input.internalNote,
          noteVisibility: "internal",
          fromStatus: "under_review",
          toStatus: "needs_changes",
        });
        await logReviewAction({
          letterRequestId: input.letterId,
          reviewerId: ctx.user.id,
          actorType: ctx.user.role as any,
          action: "changes_requested",
          noteText: input.userVisibleNote,
          noteVisibility: "user_visible",
        });
        try {
          const appUrl = getAppUrl(ctx.req);
          const subscriber = await getUserById(letter.userId);
          if (subscriber?.email) {
            await sendNeedsChangesEmail({
              to: subscriber.email,
              name: subscriber.name ?? "Subscriber",
              subject: letter.subject,
              letterId: input.letterId,
              attorneyNote: input.userVisibleNote,
              appUrl,
            });
          }
          await createNotification({
            userId: letter.userId,
            type: "needs_changes",
            title: "Changes requested for your letter",
            body: input.userVisibleNote,
            link: `/letters/${input.letterId}`,
          });
        } catch (err) {
          console.error("[Notify] Failed:", err);
        }
        if (input.retriggerPipeline && letter.intakeJson) {
          retryPipelineFromStage(
            input.letterId,
            letter.intakeJson as any,
            "drafting"
          ).catch(console.error);
        }
        return { success: true };
      }),

    saveEdit: attorneyProcedure
      .input(
        z.object({
          letterId: z.number(),
          content: z.string().min(50),
          note: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const letter = await getLetterRequestById(input.letterId);
        if (!letter) throw new TRPCError({ code: "NOT_FOUND" });
        if (
          ctx.user.role !== "admin" &&
          letter.assignedReviewerId !== ctx.user.id
        )
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You are not assigned to this letter",
          });
        const version = await createLetterVersion({
          letterRequestId: input.letterId,
          versionType: "attorney_edit",
          content: input.content,
          createdByType: ctx.user.role as any,
          createdByUserId: ctx.user.id,
          metadataJson: { note: input.note },
        });
        await logReviewAction({
          letterRequestId: input.letterId,
          reviewerId: ctx.user.id,
          actorType: ctx.user.role as any,
          action: "attorney_edit_saved",
          noteText: input.note,
          noteVisibility: "internal",
        });
        return { versionId: (version as any)?.insertId };
      }),
  }),

  // ─── Admin ─────────────────────────────────────────────────────────────────
  admin: router({
    stats: adminProcedure.query(async () => getSystemStats()),

    users: adminProcedure
      .input(
        z
          .object({
            role: z
              .enum(["subscriber", "employee", "admin", "attorney"])
              .optional(),
          })
          .optional()
      )
      .query(async ({ input }) => getAllUsers(input?.role)),

    updateRole: adminProcedure
      .input(
        z.object({
          userId: z.number(),
          // Admin role is NOT assignable via the UI — it is hard-coded to
          // ravivo@homes.land and moizj00@gmail.com in the auth layer.
          role: z.enum(["subscriber", "employee", "attorney"]),
        })
      )
      .mutation(async ({ input }) => {
        // ── Guard: block promoting active subscribers to attorney ──
        // An active subscriber has a billing relationship (Stripe subscription).
        // Changing their role to attorney would remove their subscriber dashboard
        // while Stripe keeps billing them — a logic flaw.
        if (input.role === "attorney") {
          const hasActiveSub = await hasActiveRecurringSubscription(input.userId);
          if (hasActiveSub) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message:
                "This user has an active subscription. Cancel their subscription before promoting them to Attorney.",
            });
          }
        }
        await updateUserRole(input.userId, input.role);

        // Invalidate the user's auth cache so their next request picks up the new role
        // immediately instead of waiting for the 30-second TTL to expire.
        const updatedUser = await getUserById(input.userId);
        if (updatedUser?.openId) {
          invalidateUserCache(updatedUser.openId);
        }

        // Notify the user when they are promoted to attorney so they know
        // to refresh their browser and access the Review Center.
        if (input.role === "attorney") {
          try {
            await createNotification({
              userId: input.userId,
              type: "role_updated",
              title: "Your account has been upgraded to Attorney",
              body: "You now have access to the Review Center. Please refresh your browser or log out and back in to activate your new role.",
              link: "/attorney",
            });
          } catch (err) {
            // Non-blocking — role update still succeeds even if notification fails
            console.error("[updateRole] Failed to send attorney promotion notification:", err);
          }
        }
        return { success: true };
      }),

    allLetters: adminProcedure
      .input(z.object({ status: z.string().optional() }).optional())
      .query(async ({ input }) =>
        getAllLetterRequests({ status: input?.status })
      ),

    failedJobs: adminProcedure.query(async () => getFailedJobs(100)),

    retryJob: adminProcedure
      .input(
        z.object({
          letterId: z.number(),
          stage: z.enum(["research", "drafting"]),
        })
      )
      .mutation(async ({ input }) => {
        const letter = await getLetterRequestById(input.letterId);
        if (!letter) throw new TRPCError({ code: "NOT_FOUND" });
        if (!letter.intakeJson)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "No intake data found",
          });
        retryPipelineFromStage(
          input.letterId,
          letter.intakeJson as any,
          input.stage
        ).catch(console.error);
        return {
          success: true,
          message: `Retry started for stage: ${input.stage}`,
        };
      }),

    purgeFailedJobs: adminProcedure.mutation(async () => {
      const result = await purgeFailedJobs();
      return { success: true, deletedCount: result.deletedCount };
    }),

    letterJobs: adminProcedure
      .input(z.object({ letterId: z.number() }))
      .query(async ({ input }) => getWorkflowJobsByLetterId(input.letterId)),

    employees: adminProcedure.query(async () => getEmployees()),

    getLetterDetail: adminProcedure
      .input(z.object({ letterId: z.number() }))
      .query(async ({ input }) => {
        const letter = await getLetterRequestById(input.letterId);
        if (!letter) throw new TRPCError({ code: "NOT_FOUND" });
        const [versions, actions, jobs] = await Promise.all([
          getLetterVersionsByRequestId(input.letterId, true), // include internal
          getReviewActions(input.letterId, true), // include internal
          getWorkflowJobsByLetterId(input.letterId),
        ]);
        const aiDraftVersion = versions.find(v => v.versionType === "ai_draft");
        return {
          ...letter,
          aiDraftContent: aiDraftVersion?.content ?? null,
          letterVersions: versions,
          reviewActions: actions,
          workflowJobs: jobs,
        };
      }),

    forceStatusTransition: adminProcedure
      .input(
        z.object({
          letterId: z.number(),
          newStatus: z.enum([
            "submitted",
            "researching",
            "drafting",
            "generated_locked",
            "pending_review",
            "under_review",
            "needs_changes",
            "approved",
            "rejected",
          ]),
          reason: z.string().min(5),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const letter = await getLetterRequestById(input.letterId);
        if (!letter) throw new TRPCError({ code: "NOT_FOUND" });
        await updateLetterStatus(input.letterId, input.newStatus, {
          force: true,
        });
        await logReviewAction({
          letterRequestId: input.letterId,
          reviewerId: ctx.user.id,
          actorType: "admin",
          action: "admin_force_status_transition",
          noteText: `Admin forced status from ${letter.status} to ${input.newStatus}. Reason: ${input.reason}`,
          noteVisibility: "internal",
          fromStatus: letter.status,
          toStatus: input.newStatus,
        });
        return { success: true };
      }),

    assignLetter: adminProcedure
      .input(z.object({ letterId: z.number(), employeeId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const letter = await getLetterRequestById(input.letterId);
        if (!letter) throw new TRPCError({ code: "NOT_FOUND" });
        await updateLetterStatus(input.letterId, letter.status, {
          assignedReviewerId: input.employeeId,
        });
        await logReviewAction({
          letterRequestId: input.letterId,
          reviewerId: ctx.user.id,
          actorType: "admin",
          action: "assigned_reviewer",
          noteText: `Assigned to employee ID ${input.employeeId}`,
          noteVisibility: "internal",
        });
        try {
          const appUrl = getAppUrl(ctx.req);
          const employee = await getUserById(input.employeeId);
          if (employee?.email) {
            await sendNewReviewNeededEmail({
              to: employee.email,
              name: employee.name ?? "Attorney",
              letterSubject: letter.subject,
              letterId: input.letterId,
              letterType: letter.letterType,
              jurisdiction: `${letter.jurisdictionState ?? ""}, ${letter.jurisdictionCountry ?? "US"}`,
              appUrl,
            });
          }
        } catch (err) {
          console.error("[Notify] Failed:", err);
        }
        return { success: true };
      }),
  }),

  // ─── Notifications ─────────────────────────────────────────────────────────
  notifications: router({
    list: protectedProcedure
      .input(z.object({ unreadOnly: z.boolean().default(false) }).optional())
      .query(async ({ ctx, input }) =>
        getNotificationsByUserId(ctx.user.id, input?.unreadOnly ?? false)
      ),

    markRead: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await markNotificationRead(input.id, ctx.user.id);
        return { success: true };
      }),

    markAllRead: protectedProcedure.mutation(async ({ ctx }) => {
      await markAllNotificationsRead(ctx.user.id);
      return { success: true };
    }),
  }),

  // ─── Shared: Letter Version Access ─────────────────────────────────────────
  versions: router({
    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const version = await getLetterVersionById(input.id);
        if (!version) throw new TRPCError({ code: "NOT_FOUND" });
        if (ctx.user.role === "subscriber") {
          // Subscribers can view final_approved versions always
          // They can also view ai_draft when the letter is generated_locked (paywall preview)
          if (version.versionType === "final_approved") return version;
          if (version.versionType === "ai_draft") {
            // Verify the letter belongs to this subscriber and is in generated_locked
            const letter = await getLetterRequestById(version.letterRequestId);
            if (
              letter &&
              letter.userId === ctx.user.id &&
              letter.status === "generated_locked"
            ) {
              return version;
            }
          }
          throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        }
        return version;
      }),
  }),
  // ─── Stripe / Billing ────────────────────────────────────────────────────
  billing: router({
    getSubscription: protectedProcedure.query(async ({ ctx }) => {
      return getUserSubscription(ctx.user.id);
    }),
    checkCanSubmit: protectedProcedure.query(async ({ ctx }) => {
      return checkLetterSubmissionAllowed(ctx.user.id);
    }),
    createCheckout: protectedProcedure
      .input(
        z.object({ planId: z.string(), discountCode: z.string().optional() })
      )
      .mutation(async ({ ctx, input }) => {
        // Rate limit: 10 checkout attempts per hour per user
        await checkTrpcRateLimit("payment", `user:${ctx.user.id}`);
        const result = await createCheckoutSession({
          userId: ctx.user.id,
          email: ctx.user.email ?? "",
          name: ctx.user.name,
          planId: input.planId,
          origin: (ctx.req.headers.origin &&
          !String(ctx.req.headers.origin).includes("localhost")
            ? ctx.req.headers.origin
            : ctx.req.headers["x-forwarded-host"]
              ? `https://${ctx.req.headers["x-forwarded-host"]}`
              : "https://www.talk-to-my-lawyer.com") as string,
          discountCode: input.discountCode,
        });
        return result;
      }),
    createBillingPortal: protectedProcedure.mutation(async ({ ctx }) => {
      const url = await createBillingPortalSession({
        userId: ctx.user.id,
        email: ctx.user.email ?? "",
        origin: (ctx.req.headers.origin &&
        !String(ctx.req.headers.origin).includes("localhost")
          ? ctx.req.headers.origin
          : ctx.req.headers["x-forwarded-host"]
            ? `https://${ctx.req.headers["x-forwarded-host"]}`
            : "https://www.talk-to-my-lawyer.com") as string,
      });
      return { url };
    }),
    // ─── Check paywall status: free | subscription_required | subscribed ───
    /**
     * Returns the paywall state for the current user:
     *   - "free"                  — first letter, free trial not yet used
     *   - "subscribed"            — active monthly/annual plan (bypass paywall entirely)
     *   - "subscription_required" — free trial already used, no active recurring subscription
     *   - "pay_per_letter"        — legacy fallback; same action as subscription_required
     */
    checkPaywallStatus: subscriberProcedure.query(async ({ ctx }) => {
      // 1. Check for active monthly/annual subscription first
      const isSubscribed = await hasActiveRecurringSubscription(ctx.user.id);
      if (isSubscribed)
        return { state: "subscribed" as const, eligible: false };
      // 2. Explicit free-trial-used marker (fast path — no letter count query needed)
      if (ctx.user.freeReviewUsedAt)
        return { state: "free_trial_used" as const, eligible: false };
      // 3. Derive from letter history for users created before the freeReviewUsedAt column
      const db = await (await import("./db")).getDb();
      if (!db) return { state: "subscription_required" as const, eligible: false };
      const { letterRequests } = await import("../drizzle/schema");
      const { eq, and, notInArray } = await import("drizzle-orm");
      const unlockedLetters = await db
        .select({ id: letterRequests.id })
        .from(letterRequests)
        .where(
          and(
            eq(letterRequests.userId, ctx.user.id),
            notInArray(letterRequests.status, [
              "submitted",
              "researching",
              "drafting",
              "generated_locked",
            ])
          )
        );
      if (unlockedLetters.length === 0)
        return { state: "free" as const, eligible: true };
      return { state: "free_trial_used" as const, eligible: false };
    }),
    // ─── Legacy alias: kept for backward compat (LetterPaywall still calls this) ───
    checkFirstLetterFree: subscriberProcedure.query(async ({ ctx }) => {
      const isSubscribed = await hasActiveRecurringSubscription(ctx.user.id);
      if (isSubscribed) return { eligible: false };
      const db = await (await import("./db")).getDb();
      if (!db) return { eligible: false };
      const { letterRequests } = await import("../drizzle/schema");
      const { eq, and, notInArray } = await import("drizzle-orm");
      const paidLetters = await db
        .select({ id: letterRequests.id })
        .from(letterRequests)
        .where(
          and(
            eq(letterRequests.userId, ctx.user.id),
            notInArray(letterRequests.status, [
              "submitted",
              "researching",
              "drafting",
              "generated_locked",
            ])
          )
        );
      return { eligible: paidLetters.length === 0 };
    }),

    // ─── Free unlock: first letter goes directly to pending_review ───
    freeUnlock: subscriberProcedure
      .input(z.object({ letterId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const letter = await getLetterRequestSafeForSubscriber(
          input.letterId,
          ctx.user.id
        );
        if (!letter)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Letter not found",
          });
        if (letter.status !== "generated_locked")
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Letter is not in generated_locked status",
          });

        // Verify they actually qualify for free first letter
        const db = await (await import("./db")).getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const { letterRequests } = await import("../drizzle/schema");
        const {
          eq: eqOp,
          and: andOp,
          notInArray: notInOp,
        } = await import("drizzle-orm");
        const paidLetters = await db
          .select({ id: letterRequests.id })
          .from(letterRequests)
          .where(
            andOp(
              eqOp(letterRequests.userId, ctx.user.id),
              notInOp(letterRequests.status, [
                "submitted",
                "researching",
                "drafting",
                "generated_locked",
              ])
            )
          );
        // Return structured state instead of throwing so the frontend can switch
        // directly to the subscribe/pay CTA without showing an error toast.
        if (paidLetters.length > 0 || ctx.user.freeReviewUsedAt) {
          return {
            ok: false as const,
            nextState: "subscription_required" as const,
            message:
              "Your free first letter has already been used. Please subscribe or pay per letter.",
          };
        }

        // Transition to pending_review
        await updateLetterStatus(input.letterId, "pending_review");
        await logReviewAction({
          letterRequestId: input.letterId,
          reviewerId: ctx.user.id,
          actorType: "subscriber",
          action: "free_unlock",
          noteText: "First letter — free attorney review (promotional)",
          noteVisibility: "internal",
          fromStatus: "generated_locked",
          toStatus: "pending_review",
        });

        // Mark the free trial as used so future checkPaywallStatus calls are fast
        const { setFreeReviewUsed } = await import("./db");
        await setFreeReviewUsed(ctx.user.id);
        // Invalidate user cache so next request reflects the updated freeReviewUsedAt
        invalidateUserCache(ctx.user.openId);

        // Send notification emails
        try {
          await sendLetterUnlockedEmail({
            to: ctx.user.email ?? "",
            name: ctx.user.name ?? "Subscriber",
            subject: letter.subject,
            letterId: input.letterId,
            appUrl: getAppUrl(ctx.req),
          });
          await sendNewReviewNeededEmail({
            to: "", // Will use admin email from config
            name: "Attorney Team",
            letterSubject: letter.subject,
            letterId: input.letterId,
            letterType: letter.letterType,
            jurisdiction: letter.jurisdictionState ?? "Unknown",
            appUrl: getAppUrl(ctx.req),
          });
        } catch (e) {
          console.error("[freeUnlock] Email error:", e);
        }

        return { ok: true as const, free: true };
      }),

    // ─── Payment History: fetch from Stripe ───
    paymentHistory: protectedProcedure.query(async ({ ctx }) => {
      const { getStripe, getOrCreateStripeCustomer } = await import("./stripe");
      const stripe = getStripe();
      try {
        const customerId = await getOrCreateStripeCustomer(
          ctx.user.id,
          ctx.user.email ?? "",
          ctx.user.name
        );
        // Fetch recent payment intents for this customer
        const paymentIntents = await stripe.paymentIntents.list({
          customer: customerId,
          limit: 25,
          expand: ["data.latest_charge"],
        });
        return paymentIntents.data.map((pi: any) => ({
          id: pi.id,
          amount: pi.amount,
          currency: pi.currency,
          status: pi.status,
          description: pi.description ?? "Letter unlock payment",
          created: pi.created,
          receiptUrl: pi.latest_charge?.receipt_url ?? null,
          metadata: pi.metadata ?? {},
        }));
      } catch (e) {
        console.error("[paymentHistory] Stripe error:", e);
        return [];
      }
    }),

    // ─── Receipts: fetch Stripe invoices for current user ───
    receipts: subscriberProcedure.query(async ({ ctx }) => {
      const { getStripe, getOrCreateStripeCustomer } = await import("./stripe");
      const stripe = getStripe();
      try {
        const customerId = await getOrCreateStripeCustomer(
          ctx.user.id,
          ctx.user.email ?? "",
          ctx.user.name
        );
        const invoices = await stripe.invoices.list({
          customer: customerId,
          limit: 50,
        });
        return {
          invoices: invoices.data.map((inv: any) => ({
            id: inv.id,
            date: inv.created,
            amount: inv.amount_paid,
            currency: inv.currency,
            status: inv.status,
            pdfUrl: inv.invoice_pdf ?? null,
            receiptUrl: inv.hosted_invoice_url ?? null,
            description: inv.lines?.data?.[0]?.description ?? "Payment",
          })),
        };
      } catch (e) {
        console.error("[receipts] Stripe error:", e);
        return { invoices: [] };
      }
    }),

    // ─── Pay-to-unlock: one-time $200 checkout for a specific locked letter ───
    payToUnlock: subscriberProcedure
      .input(
        z.object({ letterId: z.number(), discountCode: z.string().optional() })
      )
      .mutation(async ({ ctx, input }) => {
        // Rate limit: 10 payment attempts per hour per user
        await checkTrpcRateLimit("payment", `user:${ctx.user.id}`);
        // Verify the letter belongs to this subscriber and is in generated_locked status
        const letter = await getLetterRequestSafeForSubscriber(
          input.letterId,
          ctx.user.id
        );
        if (!letter)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Letter not found",
          });
        if (letter.status !== "generated_locked")
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Letter is not in generated_locked status",
          });
        const origin = getAppUrl(ctx.req);
        const result = await createLetterUnlockCheckout({
          userId: ctx.user.id,
          email: ctx.user.email ?? "",
          name: ctx.user.name,
          letterId: input.letterId,
          origin,
          discountCode: input.discountCode,
        });
        return result;
      }),

  }),

  // ─── Employee Affiliate System ──────────────────────────────────────────────
  affiliate: router({
    // Employee: get or create my discount code
    myCode: employeeProcedure.query(async ({ ctx }) => {
      let code = await getDiscountCodeByEmployeeId(ctx.user.id);
      if (!code) {
        code = await createDiscountCodeForEmployee(
          ctx.user.id,
          ctx.user.name ?? "EMP"
        );
      }
      return code;
    }),

    // Employee: get my earnings summary
    myEarnings: employeeProcedure.query(async ({ ctx }) => {
      return getEmployeeEarningsSummary(ctx.user.id);
    }),

    // Employee: get my commission history
    myCommissions: employeeProcedure.query(async ({ ctx }) => {
      return getCommissionsByEmployeeId(ctx.user.id);
    }),

    // Employee: request a payout
    requestPayout: employeeProcedure
      .input(
        z.object({
          amount: z.number().min(1000, "Minimum payout is $10.00"),
          paymentMethod: z.string().default("bank_transfer"),
          paymentDetails: z
            .object({
              bankName: z.string().optional(),
              accountLast4: z.string().optional(),
              routingNumber: z.string().optional(),
              paypalEmail: z.string().email().optional(),
              venmoHandle: z.string().optional(),
            })
            .optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        // Verify employee has enough pending balance
        const earnings = await getEmployeeEarningsSummary(ctx.user.id);
        if (earnings.pending < input.amount) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Insufficient pending balance. Available: $${(earnings.pending / 100).toFixed(2)}`,
          });
        }
        const result = await createPayoutRequest({
          employeeId: ctx.user.id,
          amount: input.amount,
          paymentMethod: input.paymentMethod,
          paymentDetails: input.paymentDetails,
        });
        return { success: true, payoutRequestId: result.insertId };
      }),

    // Employee: get my payout requests
    myPayouts: employeeProcedure.query(async ({ ctx }) => {
      return getPayoutRequestsByEmployeeId(ctx.user.id);
    }),

    // Public: validate a discount code (for checkout)
    validateCode: publicProcedure
      .input(z.object({ code: z.string().min(1) }))
      .query(async ({ input }) => {
        const code = await getDiscountCodeByCode(input.code);
        if (!code || !code.isActive)
          return { valid: false, discountPercent: 0 };
        if (code.maxUses && code.usageCount >= code.maxUses)
          return { valid: false, discountPercent: 0 };
        if (code.expiresAt && new Date(code.expiresAt) < new Date())
          return { valid: false, discountPercent: 0 };
        return { valid: true, discountPercent: code.discountPercent };
      }),

    // ─── Admin: Affiliate Oversight ──────────────────────────────────────────
    adminAllCodes: adminProcedure.query(async () => getAllDiscountCodes()),

    adminAllCommissions: adminProcedure.query(async () => getAllCommissions()),

    adminAllPayouts: adminProcedure.query(async () => getAllPayoutRequests()),

    adminUpdateCode: adminProcedure
      .input(
        z.object({
          id: z.number(),
          isActive: z.boolean().optional(),
          discountPercent: z.number().min(1).max(100).optional(),
          maxUses: z.number().nullable().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await updateDiscountCode(id, data);
        return { success: true };
      }),

    adminProcessPayout: adminProcedure
      .input(
        z.object({
          payoutId: z.number(),
          action: z.enum(["completed", "rejected"]),
          rejectionReason: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const payout = await getPayoutRequestById(input.payoutId);
        if (!payout) throw new TRPCError({ code: "NOT_FOUND" });
        if (payout.status !== "pending")
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Payout already processed",
          });

        if (input.action === "completed") {
          // Mark related pending commissions as paid
          const commissions = await getCommissionsByEmployeeId(
            payout.employeeId
          );
          const pendingIds = commissions
            .filter(c => c.status === "pending")
            .map(c => c.id);
          if (pendingIds.length > 0) {
            await markCommissionsPaid(pendingIds);
          }
        }

        await processPayoutRequest(
          input.payoutId,
          ctx.user.id,
          input.action,
          input.rejectionReason
        );
        return { success: true };
      }),

    adminEmployeePerformance: adminProcedure.query(async () => {
      // Batched: 3 queries total instead of 2N+1 (N+1 fix)
      const [employees, allCodes, allEarnings] = await Promise.all([
        getEmployees(),
        getAllDiscountCodes(),
        getAllEmployeeEarnings(),
      ]);

      // Build lookup maps for O(1) access
      const codesByEmployee = new Map(allCodes.map(c => [c.employeeId, c]));
      const earningsByEmployee = new Map(
        allEarnings.map(e => [e.employeeId, e])
      );

      return employees.map(emp => {
        const code = codesByEmployee.get(emp.id);
        const earnings = earningsByEmployee.get(emp.id);
        return {
          employeeId: emp.id,
          name: emp.name,
          email: emp.email,
          role: emp.role,
          discountCode: code?.code ?? null,
          codeActive: code?.isActive ?? false,
          usageCount: code?.usageCount ?? 0,
          totalEarned: earnings?.totalEarned ?? 0,
          pending: earnings?.pending ?? 0,
          paid: earnings?.paid ?? 0,
          referralCount: earnings?.referralCount ?? 0,
        };
      });
    }),
  }),
  // ─── Profile ──────────────────────────────────────────────────────────────
  profile: router({
    updateProfile: protectedProcedure
      .input(
        z.object({
          name: z.string().min(1).max(200).optional(),
          email: z.string().email().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        await updateUserProfile(ctx.user.id, input);
        return { success: true };
      }),
    changeEmail: protectedProcedure
      .input(
        z.object({
          newEmail: z.string().email("Please enter a valid email address"),
          currentPassword: z
            .string()
            .min(1, "Password is required to change email"),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const { createClient } = await import("@supabase/supabase-js");
        const crypto = await import("crypto");
        const sbUrl =
          process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
        const sbAnonKey =
          process.env.VITE_SUPABASE_ANON_KEY ||
          process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
          "";
        const sbServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

        // Check new email is different from current
        if (input.newEmail.toLowerCase() === ctx.user.email?.toLowerCase()) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "New email is the same as your current email",
          });
        }

        // Check new email is not already taken
        const existingUser = await getUserByEmail(input.newEmail);
        if (existingUser && existingUser.id !== ctx.user.id) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "This email address is already in use",
          });
        }

        // Verify current password
        const verifyClient = createClient(sbUrl, sbAnonKey, {
          auth: { autoRefreshToken: false, persistSession: false },
        });
        const { error: signInError } =
          await verifyClient.auth.signInWithPassword({
            email: ctx.user.email!,
            password: input.currentPassword,
          });
        if (signInError) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "Current password is incorrect",
          });
        }

        // Update email in Supabase Auth
        const serviceClient = createClient(sbUrl, sbServiceKey, {
          auth: { autoRefreshToken: false, persistSession: false },
        });
        const { error: updateError } =
          await serviceClient.auth.admin.updateUserById(ctx.user.openId, {
            email: input.newEmail,
          });
        if (updateError) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to update email in auth system",
          });
        }

        // Update email in app database and set emailVerified = false
        await updateUserProfile(ctx.user.id, { email: input.newEmail });
        const db = (await import("./db")).getDb;
        const dbInstance = await (await import("./db")).getDb();
        if (dbInstance) {
          const { users } = await import("../drizzle/schema");
          const { eq } = await import("drizzle-orm");
          await dbInstance
            .update(users)
            .set({ emailVerified: false, updatedAt: new Date() })
            .where(eq(users.id, ctx.user.id));
        }

        // Send verification email to new address
        const verificationToken = crypto.randomBytes(48).toString("hex");
        await deleteUserVerificationTokens(ctx.user.id);
        await createEmailVerificationToken(
          ctx.user.id,
          input.newEmail,
          verificationToken
        );
        const origin =
          ctx.req?.headers?.origin &&
          !String(ctx.req?.headers?.origin).includes("localhost")
            ? (ctx.req.headers.origin as string)
            : ctx.req?.headers?.["x-forwarded-host"]
              ? `https://${ctx.req.headers["x-forwarded-host"]}`
              : "https://www.talk-to-my-lawyer.com";
        const verifyUrl = `${origin}/verify-email?token=${verificationToken}`;
        try {
          await sendVerificationEmail({
            to: input.newEmail,
            name: ctx.user.name || input.newEmail.split("@")[0],
            verifyUrl,
          });
        } catch (emailErr) {
          console.error(
            "[Profile] Failed to send verification email:",
            emailErr
          );
        }

        return {
          success: true,
          message:
            "Email updated. Please check your new email for a verification link.",
        };
      }),
    changePassword: protectedProcedure
      .input(
        z.object({
          currentPassword: z.string().min(1),
          newPassword: z
            .string()
            .min(8, "Password must be at least 8 characters"),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const { createClient } = await import("@supabase/supabase-js");
        const sbUrl =
          process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
        const sbAnonKey =
          process.env.VITE_SUPABASE_ANON_KEY ||
          process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
          "";
        const sbServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
        // Verify current password by attempting sign-in
        const verifyClient = createClient(sbUrl, sbAnonKey, {
          auth: { autoRefreshToken: false, persistSession: false },
        });
        const { error: signInError } =
          await verifyClient.auth.signInWithPassword({
            email: ctx.user.email!,
            password: input.currentPassword,
          });
        if (signInError) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "Current password is incorrect",
          });
        }
        // Update password using service role client
        const serviceClient = createClient(sbUrl, sbServiceKey, {
          auth: { autoRefreshToken: false, persistSession: false },
        });
        const { error: updateError } =
          await serviceClient.auth.admin.updateUserById(ctx.user.openId, {
            password: input.newPassword,
          });
        if (updateError) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to update password",
          });
        }
        return { success: true };
      }),
  }),
});
export type AppRouter = typeof appRouter;
