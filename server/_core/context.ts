import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { authenticateRequest } from "../supabaseAuth";
import { setServerUser } from "../sentry";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    user = await authenticateRequest(opts.req);
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }

  // Set Sentry user context for this request scope
  if (user) {
    setServerUser({
      id: String(user.id),
      email: user.email ?? undefined,
      role: user.role ?? undefined,
    });
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
