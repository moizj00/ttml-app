/**
 * Admin service — encapsulates user role management and attorney onboarding logic.
 *
 * Responsibilities:
 *  - Role transitions with "permanent subscriber" guard (updateUserRole)
 *  - Attorney onboarding awareness (pending letters notifications)
 *  - Supabase auth admin operations (inviteAttorney)
 *  - Letter state diagnosis and repair (diagnoseLetterState)
 *
 * The tRPC router (server/routers/admin.ts) delegates to this service so
 * it can stay thin: input validation + auth guards + service call.
 */

import { TRPCError } from "@trpc/server";
import type { Request } from "express";
import {
  updateUserRole,
  assignRoleId,
  getUserById,
  createNotification,
  notifyAdmins,
  getAllLetterRequests,
  getUserByEmail,
  getLetterRequestById,
  updateLetterStatus,
  logReviewAction,
  getLetterVersionsByRequestId,
  getWorkflowJobsByLetterId,
} from "../db";
import { sendAttorneyInvitationEmail, sendNewReviewNeededEmail } from "../email";
import { captureServerException } from "../sentry";
import { invalidateUserCache, getOriginUrl } from "../supabaseAuth";
import { hasEverSubscribed } from "../stripe";
import { enqueueRetryFromStageJob } from "../queue";
import { logger } from "../logger";

// ─── Role Transition ────────────────────────────────────────────────────────

export interface UpdateRoleInput {
  userId: number;
  role: "subscriber" | "employee" | "attorney";
}

/**
 * Update a user's role with the "permanent subscriber" guard.
 *
 * Business rules enforced here:
 *  - Users who have EVER subscribed (any plan, any status including cancelled)
 *    CANNOT be promoted to attorney. This prevents billing/role conflicts.
 *  - Promoted attorneys receive an in-app notification and onboarding awareness
 *    about existing letters in the review queue.
 *  - Auth cache is invalidated so the next request sees the new role immediately.
 */
export async function changeUserRole(
  input: UpdateRoleInput,
  actingAdminId: number
): Promise<{ success: boolean }> {
  if (input.role === "attorney") {
    const everSubscribed = await hasEverSubscribed(input.userId);
    if (everSubscribed) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          "This user has a subscription history and cannot be promoted to Attorney. The subscriber role is permanent once a plan has been purchased.",
      });
    }
  }

  await updateUserRole(input.userId, input.role);
  try {
    await assignRoleId(input.userId, input.role);
  } catch (e) {
    logger.error("[changeUserRole] Role ID assignment failed:", e);
  }

  const updatedUser = await getUserById(input.userId);
  if (updatedUser?.openId) {
    invalidateUserCache(updatedUser.openId);
  }

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
      logger.error("[changeUserRole] Failed to send attorney promotion notification:", err);
      captureServerException(err, { tags: { component: "admin", error_type: "attorney_promotion_notification_failed" } });
    }

    await _notifyAttorneyOfPendingQueue(input.userId, "[changeUserRole]");
  }

  try {
    const targetUser = await getUserById(input.userId);
    await notifyAdmins({
      category: "users",
      type: "user_role_changed",
      title: `User role changed to ${input.role}`,
      body: `${targetUser?.name ?? targetUser?.email ?? `User #${input.userId}`} was changed to ${input.role}.`,
      link: `/admin/users`,
    });
  } catch (err) {
    logger.error("[notifyAdmins] user_role_changed:", err);
    captureServerException(err, { tags: { component: "admin", error_type: "notify_admins_role_changed" } });
  }

  return { success: true };
}

// ─── Invite Attorney ────────────────────────────────────────────────────────

export interface InviteAttorneyInput {
  email: string;
  name?: string;
}

export interface InviteAttorneyContext {
  actingAdmin: { id: number; name?: string | null; email?: string | null };
  req: Request;
}

/**
 * Invite a new attorney by email.
 * Handles both existing users (role promotion) and brand-new users (Supabase auth creation).
 * Enforces the "permanent subscriber" guard and sends the invitation email.
 */
export async function inviteAttorney(
  input: InviteAttorneyInput,
  ctx: InviteAttorneyContext
): Promise<{ success: boolean; alreadyExisted?: boolean; message?: string }> {
  const email = input.email.toLowerCase().trim();
  const name = input.name?.trim() || email.split("@")[0];

  const existingUser = await getUserByEmail(email);
  if (existingUser) {
    if (existingUser.role === "attorney") {
      throw new TRPCError({ code: "CONFLICT", message: "This user is already an attorney." });
    }
    const everSubscribed = await hasEverSubscribed(existingUser.id);
    if (everSubscribed) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "This user has a subscription history and cannot be promoted to Attorney. The subscriber role is permanent once a plan has been purchased.",
      });
    }
    await updateUserRole(existingUser.id, "attorney");
    try { await assignRoleId(existingUser.id, "attorney"); } catch (e) {
      logger.error("[inviteAttorney] Role ID assignment failed:", e);
    }
    if (existingUser.openId) invalidateUserCache(existingUser.openId);
    try {
      await createNotification({
        userId: existingUser.id,
        type: "role_updated",
        title: "Your account has been upgraded to Attorney",
        body: "You now have access to the Review Center. Please refresh your browser or log out and back in to activate your new role.",
        link: "/attorney",
      });
    } catch (err) {
      logger.error("[inviteAttorney] notification failed:", err);
    }
    await _notifyAttorneyOfPendingQueue(existingUser.id, "[inviteAttorney]");
    return { success: true, alreadyExisted: true, message: `${email} already had an account and has been promoted to attorney.` };
  }

  const serviceClient = await _getSupabaseServiceClient();

  const crypto = await import("crypto");
  const randomPassword = crypto.randomBytes(32).toString("hex");
  const { data: createData, error: createError } = await serviceClient.auth.admin.createUser({
    email,
    password: randomPassword,
    email_confirm: true,
    user_metadata: { name, invited_attorney: true },
  });

  if (createError) {
    logger.error("[inviteAttorney] Supabase createUser error:", createError.message);
    if (createError.message.includes("already") || createError.message.includes("exists")) {
      return await _handleExistingAuthUser(email, name, ctx, serviceClient);
    }
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: createError.message });
  }

  if (!createData.user) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create auth user." });
  }

  const { upsertUser, getUserByOpenId } = await import("../db");
  await upsertUser({
    openId: createData.user.id,
    name,
    email,
    loginMethod: "email",
    lastSignedIn: new Date(),
    role: "attorney",
    emailVerified: true,
  });
  invalidateUserCache(createData.user.id);

  const appUser = await getUserByOpenId(createData.user.id);
  if (appUser) {
    try { await assignRoleId(appUser.id, "attorney"); } catch (e) {
      logger.error("[inviteAttorney] Role ID assignment failed:", e);
    }
  }

  const origin = getOriginUrl(ctx.req);
  const { data: linkData, error: linkError } = await serviceClient.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo: `${origin}/accept-invitation` },
  });

  if (linkError || !linkData?.properties?.action_link) {
    logger.error("[inviteAttorney] generateLink error:", linkError?.message);
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "User created but failed to generate invitation link. The attorney can use 'Forgot Password' to set their password.",
    });
  }

  try {
    await sendAttorneyInvitationEmail({
      to: email,
      name,
      setPasswordUrl: linkData.properties.action_link,
      invitedByName: ctx.actingAdmin.name || undefined,
    });
  } catch (emailErr) {
    logger.error("[inviteAttorney] Failed to send invitation email:", emailErr);
    captureServerException(emailErr, { tags: { component: "admin", error_type: "attorney_invitation_email_failed" } });
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Attorney account created but invitation email failed to send. They can use 'Forgot Password' to access their account.",
    });
  }

  try {
    await notifyAdmins({
      category: "users",
      type: "attorney_invited",
      title: `Attorney invited: ${name}`,
      body: `${email} was invited as an attorney by ${ctx.actingAdmin.name || ctx.actingAdmin.email || "an admin"}.`,
      link: `/admin/users`,
    });
  } catch (err) {
    logger.error("[notifyAdmins] attorney_invited:", err);
  }

  if (appUser) {
    await _notifyAttorneyOfPendingQueue(appUser.id, "[inviteAttorney]");
  }

  return { success: true };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Notify a newly-onboarded attorney of any letters already in the pending_review queue. */
async function _notifyAttorneyOfPendingQueue(userId: number, logPrefix: string): Promise<void> {
  try {
    const pendingLetters = await getAllLetterRequests({ status: "pending_review" });
    if (pendingLetters.length > 0) {
      logger.info(`${logPrefix} Attorney #${userId} onboarded — ${pendingLetters.length} pending_review letter(s) already in queue`);
      await createNotification({
        userId,
        type: "attorney_onboarding_queue",
        category: "letters",
        title: `${pendingLetters.length} letter${pendingLetters.length !== 1 ? "s" : ""} awaiting review in the Review Center`,
        body: `Welcome! There ${pendingLetters.length !== 1 ? "are" : "is"} already ${pendingLetters.length} letter${pendingLetters.length !== 1 ? "s" : ""} in the queue waiting for attorney review.`,
        link: "/attorney/queue",
      });
    }
  } catch (err) {
    logger.error(`${logPrefix} Onboarding queue notification failed:`, err);
  }
}

/** Create a Supabase service-role client for admin operations. */
async function _getSupabaseServiceClient() {
  const { createClient } = await import("@supabase/supabase-js");
  const sbUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
  const sbServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!sbUrl || !sbServiceKey) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Supabase configuration missing." });
  }
  return createClient(sbUrl, sbServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Handle the case where a user exists in Supabase auth but not in the app DB. */
async function _handleExistingAuthUser(
  email: string,
  name: string,
  ctx: InviteAttorneyContext,
  serviceClient: Awaited<ReturnType<typeof _getSupabaseServiceClient>>
): Promise<{ success: boolean; alreadyExisted: boolean; message: string }> {
  try {
    const origin = getOriginUrl(ctx.req);
    const { data: linkData } = await serviceClient.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo: `${origin}/accept-invitation` },
    });
    if (linkData?.properties?.action_link && linkData.user) {
      const authUserId = linkData.user.id;
      const { upsertUser, getUserByOpenId } = await import("../db");
      await upsertUser({
        openId: authUserId,
        name,
        email,
        loginMethod: "email",
        lastSignedIn: new Date(),
        role: "attorney",
        emailVerified: true,
      });
      invalidateUserCache(authUserId);
      const existingAppUser = await getUserByOpenId(authUserId);
      if (existingAppUser) {
        try { await assignRoleId(existingAppUser.id, "attorney"); } catch (e) {
          logger.error("[inviteAttorney] Role ID assignment for existing auth user:", e);
        }
      }
      await serviceClient.auth.admin.updateUserById(authUserId, {
        user_metadata: { name, invited_attorney: true },
      });
      await sendAttorneyInvitationEmail({
        to: email,
        name,
        setPasswordUrl: linkData.properties.action_link,
        invitedByName: ctx.actingAdmin.name || undefined,
      });
      if (existingAppUser) {
        await _notifyAttorneyOfPendingQueue(existingAppUser.id, "[inviteAttorney:recover]");
      }
      return { success: true, alreadyExisted: true, message: `${email} had an auth account and has been set up as an attorney. Invitation sent.` };
    }
  } catch (recoveryErr) {
    logger.error("[inviteAttorney] Recovery attempt for existing auth user failed:", recoveryErr);
  }
  throw new TRPCError({ code: "CONFLICT", message: "An account with this email already exists in the auth system." });
}

// ─── Pipeline Retry ────────────────────────────────────────────────────────

export interface RetryJobInput {
  letterId: number;
  stage: "research" | "drafting";
}

export async function retryPipelineJob(input: RetryJobInput) {
  const letter = await getLetterRequestById(input.letterId);
  if (!letter) throw new TRPCError({ code: "NOT_FOUND" });
  if (!letter.intakeJson)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "No intake data found for this letter. Cannot retry.",
    });

  const { preflightApiKeyCheck } = await import("../pipeline");
  const apiCheck = preflightApiKeyCheck(input.stage);
  if (!apiCheck.ok) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: `Cannot retry: ${apiCheck.missing.join("; ")}. Please configure the required API keys first.`,
    });
  }

  try {
    const jobId = await enqueueRetryFromStageJob({
      type: "retryPipelineFromStage",
      letterId: input.letterId,
      intake: letter.intakeJson,
      stage: input.stage,
      userId: letter.userId ?? undefined,
    });
    return {
      success: true,
      message: `Retry started for stage: ${input.stage} (job: ${jobId})`,
    };
  } catch (enqueueErr) {
    logger.error(`[Admin] Failed to enqueue retry for letter #${input.letterId}:`, enqueueErr);
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `Failed to enqueue retry job: ${enqueueErr instanceof Error ? enqueueErr.message : String(enqueueErr)}`,
    });
  }
}

// ─── Force Status Transition ───────────────────────────────────────────────

export interface ForceStatusInput {
  letterId: number;
  newStatus: string;
  reason: string;
}

export async function forceStatusTransition(
  input: ForceStatusInput,
  ctx: { userId: number; appUrl: string },
) {
  const letter = await getLetterRequestById(input.letterId);
  if (!letter) throw new TRPCError({ code: "NOT_FOUND" });

  if (input.newStatus === "pending_review" || input.newStatus === "approved") {
    const versions = await getLetterVersionsByRequestId(input.letterId, true);
    if (versions.length === 0) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: `Cannot force to "${input.newStatus}": this letter has no content version. Generate a draft first.`,
      });
    }
  }

  await updateLetterStatus(input.letterId, input.newStatus, { force: true });
  await logReviewAction({
    letterRequestId: input.letterId,
    reviewerId: ctx.userId,
    actorType: "admin",
    action: "admin_force_status_transition",
    noteText: `Admin forced status from ${letter.status} to ${input.newStatus}. Reason: ${input.reason}`,
    noteVisibility: "internal",
    fromStatus: letter.status,
    toStatus: input.newStatus,
  });
  if (input.newStatus === "pending_review") {
    try {
      if (letter.assignedReviewerId) {
        const attorney = await getUserById(letter.assignedReviewerId);
        if (attorney?.email) {
          await sendNewReviewNeededEmail({
            to: attorney.email,
            name: attorney.name ?? "Attorney",
            letterSubject: letter.subject,
            letterId: input.letterId,
            letterType: letter.letterType,
            jurisdiction: `${letter.jurisdictionState ?? ""}, ${letter.jurisdictionCountry ?? "US"}`,
            appUrl: ctx.appUrl,
          });
        }
      }
    } catch (_err) {
      // Non-fatal: email failure should not block the status transition
    }
  }
  return { success: true };
}

// ─── Letter State Repair ───────────────────────────────────────────────────

export async function diagnoseAndRepairLetterState(
  letterId: number,
  adminUserId: number,
) {
  const letter = await getLetterRequestById(letterId);
  if (!letter) throw new TRPCError({ code: "NOT_FOUND" });

  const findings: string[] = [];

  const [versions, jobs] = await Promise.all([
    getLetterVersionsByRequestId(letterId, true),
    getWorkflowJobsByLetterId(letterId),
  ]);

  const hasContentVersion = versions.some(
    v => v.versionType === "ai_draft" || v.versionType === "final_approved"
  );
  const hasFailed = jobs.some(j => j.status === "failed");
  const isStuckInPipeline =
    ["submitted", "researching", "drafting"].includes(letter.status) &&
    hasFailed &&
    !hasContentVersion;

  if (isStuckInPipeline) {
    findings.push(
      `Detected stuck-processing: status="${letter.status}", has failed job(s), no content version`
    );
    await updateLetterStatus(letterId, "submitted", { force: true });
    await logReviewAction({
      letterRequestId: letterId,
      reviewerId: adminUserId,
      actorType: "admin",
      action: "admin_repair_letter_state",
      noteText: `Repaired stuck letter: reset from "${letter.status}" to "submitted". Has failed job(s), no content version.`,
      noteVisibility: "internal",
      fromStatus: letter.status,
      toStatus: "submitted",
    });
    findings.push(`Reset status from "${letter.status}" to "submitted"`);
  } else {
    findings.push(
      `No broken-processing pattern detected (status="${letter.status}", hasContentVersion=${hasContentVersion}, hasFailed=${hasFailed}). No changes made.`
    );
  }

  return { success: true, findings };
}
