// ─── Sentry must be initialized BEFORE any other imports that might throw ───
import { initSentry } from "@/lib/sentry";
initSentry();

import { trpc } from "@/lib/trpc";
import { UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import { toast } from "sonner";
import superjson from "superjson";
import { HelmetProvider } from "react-helmet-async";
import App from "./App";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Treat data as fresh for 60s so window focus / component remount don't
      // trigger immediate refetches on every tRPC query. Hooks that need
      // fresher data (e.g. useAuth for role changes) override per-query.
      staleTime: 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;

  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;
  if (!isUnauthorized) return;

  localStorage.removeItem("sb_access_token");
  localStorage.removeItem("sb_refresh_token");

  // Don't redirect if already on an auth page
  const authPaths = ["/login", "/signup", "/forgot-password"];
  if (authPaths.some(p => window.location.pathname.startsWith(p))) return;

  window.location.href = "/login";
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Mutation Error]", error);
    if (error instanceof TRPCClientError && error.message !== UNAUTHED_ERR_MSG) {
      const hasLocalHandler = event.mutation.options?.onError;
      if (!hasLocalHandler) {
        toast.error("Something went wrong", {
          description: error.message || "Please try again.",
        });
      }
    }
  }
});

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      // Auth is handled exclusively via the httpOnly `sb_session` cookie set by
      // the server after login/OAuth. We do NOT send a localStorage bearer token
      // here because a stale/expired token in localStorage would override the
      // valid cookie on every request, causing spurious auth failures after
      // Google OAuth sign-in and on page refresh.
      //
      // The server's authenticateRequest() reads the cookie first (extractCookieToken),
      // then falls back to the Authorization header — so cookie-only is correct.
      fetch(input, init) {
        return globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
        });
      },
    }),
  ],
});

createRoot(document.getElementById("root")!).render(
  <HelmetProvider>
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </trpc.Provider>
  </HelmetProvider>
);
