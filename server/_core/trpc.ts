import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG, EMAIL_NOT_VERIFIED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { ADMIN_2FA_COOKIE, verifyAdmin2FAToken } from "./admin2fa";
import { parseCookieHeader } from "./cookies";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const mergeRouters = t.mergeRouters;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

const requireEmailVerified = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  if (!ctx.user.emailVerified) {
    throw new TRPCError({ code: "FORBIDDEN", message: EMAIL_NOT_VERIFIED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const emailVerifiedProcedure = t.procedure.use(requireUser).use(requireEmailVerified);

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== 'admin') {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    const cookies = parseCookieHeader(ctx.req.headers.cookie);
    const tfaCookie = cookies.get(ADMIN_2FA_COOKIE);
    if (!tfaCookie || !verifyAdmin2FAToken(tfaCookie, ctx.user.id)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "ADMIN_2FA_REQUIRED" });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);

/**
 * Super Admin Procedure — platform-owner only.
 *
 * In addition to adminProcedure checks (role === 'admin' + 2FA), this
 * enforces a hard-coded whitelist of owner emails. Use for destructive /
 * bypass operations (force status transition, force free preview unlock)
 * that should only be available to the platform owner, not employee admins.
 */
export const superAdminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    // Reuse admin checks
    if (!ctx.user || ctx.user.role !== 'admin') {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    const cookies = parseCookieHeader(ctx.req.headers.cookie);
    const tfaCookie = cookies.get(ADMIN_2FA_COOKIE);
    if (!tfaCookie || !verifyAdmin2FAToken(tfaCookie, ctx.user.id)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "ADMIN_2FA_REQUIRED" });
    }

    // Hard-coded owner whitelist
    const HARDCODED_OWNER_EMAILS = [
      "moizj00@gmail.com",
      "moizj00@yahoo.com",
    ];
    if (!HARDCODED_OWNER_EMAILS.includes(ctx.user.email)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "This operation is restricted to platform owners only",
      });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);
