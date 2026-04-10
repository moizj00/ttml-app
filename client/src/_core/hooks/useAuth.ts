import { setSentryUser, clearSentryUser } from "@/lib/sentry";
import { trpc } from "@/lib/trpc";
import { TRPCClientError } from "@trpc/client";
import { useCallback, useEffect, useMemo } from "react";

type UseAuthOptions = {
  redirectOnUnauthenticated?: boolean;
  redirectPath?: string;
};

export function useAuth(options?: UseAuthOptions) {
  const { redirectOnUnauthenticated = false, redirectPath = "/login" } =
    options ?? {};
  const utils = trpc.useUtils();

  const meQuery = trpc.auth.me.useQuery(undefined, {
    retry: false,
    // staleTime: 0 — always treat auth.me as stale so that role changes
    // made by an admin (e.g. subscriber → attorney) are reflected
    // immediately on the next page load or window focus, without the
    // user needing to log out and back in.
    // The server-side user cache (30 s TTL) is invalidated by
    // invalidateUserCache() in the updateRole mutation, so the DB read
    // always returns the fresh role.
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      // Clear stored tokens on logout
      localStorage.removeItem("sb_access_token");
      localStorage.removeItem("sb_refresh_token");
      utils.auth.me.setData(undefined, null);
    },
  });

  const logout = useCallback(async () => {
    try {
      await logoutMutation.mutateAsync();
    } catch (error: unknown) {
      if (
        error instanceof TRPCClientError &&
        error.data?.code === "UNAUTHORIZED"
      ) {
        return;
      }
      throw error;
    } finally {
      localStorage.removeItem("sb_access_token");
      localStorage.removeItem("sb_refresh_token");
      utils.auth.me.setData(undefined, null);
      await utils.auth.me.invalidate();
    }
  }, [logoutMutation, utils]);

  const state = useMemo(() => {
    return {
      user: meQuery.data ?? null,
      loading: meQuery.isLoading || logoutMutation.isPending,
      error: meQuery.error ?? logoutMutation.error ?? null,
      isAuthenticated: Boolean(meQuery.data),
    };
  }, [
    meQuery.data,
    meQuery.error,
    meQuery.isLoading,
    logoutMutation.error,
    logoutMutation.isPending,
  ]);

  // ─── Sync Sentry user context ───
  useEffect(() => {
    if (state.user) {
      setSentryUser({
        id: String(state.user.id),
        email: state.user.email ?? undefined,
        role: state.user.role ?? undefined,
      });
    } else if (!meQuery.isLoading) {
      clearSentryUser();
    }
  }, [state.user, meQuery.isLoading]);

  useEffect(() => {
    if (!redirectOnUnauthenticated) return;
    if (meQuery.isLoading || logoutMutation.isPending) return;
    if (state.user) return;
    if (typeof window === "undefined") return;
    // Don't redirect if already on an auth page
    const authPaths = ["/login", "/signup", "/forgot-password"];
    if (authPaths.some(p => window.location.pathname.startsWith(p))) return;

    window.location.href = redirectPath;
  }, [
    redirectOnUnauthenticated,
    redirectPath,
    logoutMutation.isPending,
    meQuery.isLoading,
    state.user,
  ]);

  return {
    ...state,
    refresh: () => meQuery.refetch(),
    logout,
  };
}
