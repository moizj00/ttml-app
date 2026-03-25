import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { ADMIN_2FA_COOKIE, verifyAdmin2FAToken } from "./admin2fa";

function parseCookieHeader(cookieHeader: string | undefined): Map<string, string> {
  if (!cookieHeader) return new Map();
  const map = new Map<string, string>();
  cookieHeader.split(";").forEach(pair => {
    const [key, ...rest] = pair.split("=");
    if (key) {
      map.set(key.trim(), decodeURIComponent(rest.join("=").trim()));
    }
  });
  return map;
}

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
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
