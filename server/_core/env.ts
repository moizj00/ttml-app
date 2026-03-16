export const ENV = {
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  // AI Pipeline
  openAiApiKey: process.env.OPENAI_API_KEY ?? "",
  perplexityApiKey: process.env.PERPLEXITY_API_KEY ?? "",
  // n8n Integration
  n8nWebhookUrl: process.env.N8N_WEBHOOK_URL ?? "",
  n8nCallbackSecret: process.env.N8N_CALLBACK_SECRET ?? "",
  // Email
  resendApiKey: process.env.RESEND_API_KEY ?? "",
  resendFromEmail: process.env.RESEND_FROM_EMAIL ?? "noreply@talk-to-my-lawyer.com",
  // Stripe
  stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? "",
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
  stripePublishableKey: process.env.VITE_STRIPE_PUBLISHABLE_KEY ?? "",
  // Upstash Redis (rate limiting)
  upstashRedisRestUrl: process.env.UPSTASH_REDIS_REST_URL ?? "",
  upstashRedisRestToken: process.env.UPSTASH_REDIS_REST_TOKEN ?? "",
  // Sentry
  sentryDsn: process.env.SENTRY_DSN ?? "",
  sentryOrg: process.env.SENTRY_ORG ?? "",
  sentryProject: process.env.SENTRY_PROJECT ?? "",
};

/**
 * Validates that all required environment variables are set.
 * Throws on startup in production if any are missing, preventing silent failures.
 */
export function validateRequiredEnv(): void {
  const missing: string[] = [];
  if (!ENV.databaseUrl) missing.push("DATABASE_URL");
  if (!process.env.SUPABASE_URL && !process.env.VITE_SUPABASE_URL)
    missing.push("SUPABASE_URL / VITE_SUPABASE_URL");
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY)
    missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!ENV.stripeSecretKey) missing.push("STRIPE_SECRET_KEY");
  if (!ENV.stripeWebhookSecret) missing.push("STRIPE_WEBHOOK_SECRET");
  if (!ENV.resendApiKey) missing.push("RESEND_API_KEY");
  if (missing.length > 0) {
    throw new Error(
      `[Startup] Missing required environment variables: ${missing.join(", ")}\n` +
        "Server cannot start without these. Check your Railway / .env configuration."
    );
  }
}
