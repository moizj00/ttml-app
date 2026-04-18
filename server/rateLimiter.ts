/**
 * Rate Limiter Module
 *
 * Uses Upstash Redis + @upstash/ratelimit to protect critical endpoints
 * from abuse. Falls back gracefully (allow) when Redis is unavailable.
 *
 * Limits applied:
 * - Auth endpoints (login, signup, forgot-password): 10 req / 15 min per IP
 * - Letter submission: 5 req / 1 hour per user ID
 * - Payment / checkout: 10 req / 1 hour per user ID
 * - General tRPC protected mutations: 60 req / 1 min per user ID
 */

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import type { Request, Response, NextFunction } from "express";
import { ENV } from "./_core/env";
import { logger } from "./logger";

// ─── Redis Client ─────────────────────────────────────────────────────────────

let redis: Redis | null = null;

export function getRedis(): Redis | null {
  if (!ENV.upstashRedisRestUrl || !ENV.upstashRedisRestToken) {
    return null;
  }
  if (!redis) {
    redis = new Redis({
      url: ENV.upstashRedisRestUrl,
      token: ENV.upstashRedisRestToken,
    });
  }
  return redis;
}

// ─── Rate Limiter Instances ───────────────────────────────────────────────────

let authLimiter: Ratelimit | null = null;
let letterSubmitLimiter: Ratelimit | null = null;
let paymentLimiter: Ratelimit | null = null;
let generalLimiter: Ratelimit | null = null;
let documentAnalysisLimiter: Ratelimit | null = null;

function getAuthLimiter(): Ratelimit | null {
  const r = getRedis();
  if (!r) return null;
  if (!authLimiter) {
    authLimiter = new Ratelimit({
      redis: r,
      limiter: Ratelimit.slidingWindow(10, "15 m"),
      prefix: "ttml:auth",
      analytics: true,
    });
  }
  return authLimiter;
}

function getLetterSubmitLimiter(): Ratelimit | null {
  const r = getRedis();
  if (!r) return null;
  if (!letterSubmitLimiter) {
    letterSubmitLimiter = new Ratelimit({
      redis: r,
      limiter: Ratelimit.slidingWindow(5, "1 h"),
      prefix: "ttml:letter",
      analytics: true,
    });
  }
  return letterSubmitLimiter;
}

function getPaymentLimiter(): Ratelimit | null {
  const r = getRedis();
  if (!r) return null;
  if (!paymentLimiter) {
    paymentLimiter = new Ratelimit({
      redis: r,
      limiter: Ratelimit.slidingWindow(10, "1 h"),
      prefix: "ttml:payment",
      analytics: true,
    });
  }
  return paymentLimiter;
}

function getGeneralLimiter(): Ratelimit | null {
  const r = getRedis();
  if (!r) return null;
  if (!generalLimiter) {
    generalLimiter = new Ratelimit({
      redis: r,
      limiter: Ratelimit.slidingWindow(60, "1 m"),
      prefix: "ttml:general",
      analytics: true,
    });
  }
  return generalLimiter;
}

function getDocumentAnalysisLimiter(): Ratelimit | null {
  const r = getRedis();
  if (!r) return null;
  if (!documentAnalysisLimiter) {
    documentAnalysisLimiter = new Ratelimit({
      redis: r,
      limiter: Ratelimit.slidingWindow(3, "1 h"),
      prefix: "ttml:docanalyze",
      analytics: true,
    });
  }
  return documentAnalysisLimiter;
}

// ─── IP Extraction ────────────────────────────────────────────────────────────

export function getClientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    // Railway appends its own trusted proxy IP as the rightmost value.
    // The client IP is the leftmost value (set by the first proxy in the chain).
    // We take the leftmost to identify the real originating client.
    const ips = Array.isArray(forwarded) ? forwarded : forwarded.split(",");
    return ips[0].trim();
  }
  return req.socket?.remoteAddress ?? "unknown";
}

// ─── Core Rate Check Helper ───────────────────────────────────────────────────

async function checkLimit(
  limiter: Ratelimit | null,
  identifier: string,
  res: Response,
  failOpen = true
): Promise<boolean> {
  if (!limiter) {
    if (!failOpen) {
      // Fail-closed: deny when Redis unavailable (protects sensitive endpoints)
      res.status(503).json({
        error: "Service temporarily unavailable. Please try again shortly.",
      });
      return false;
    }
    // Fail-open: allow when Redis unavailable (general endpoints)
    return true;
  }
  try {
    const result = await limiter.limit(identifier);
    res.setHeader("X-RateLimit-Limit", result.limit);
    res.setHeader("X-RateLimit-Remaining", result.remaining);
    res.setHeader("X-RateLimit-Reset", result.reset);
    if (!result.success) {
      const retryAfterSeconds = Math.ceil((result.reset - Date.now()) / 1000);
      res.setHeader("Retry-After", retryAfterSeconds);
      res.status(429).json({
        error: "Too many requests. Please slow down and try again shortly.",
        retryAfter: retryAfterSeconds,
      });
      return false;
    }
    return true;
  } catch (err) {
    if (!failOpen) {
      // Fail-closed: deny on Redis error for sensitive endpoints
      logger.error({ err: err }, "[RateLimit] Redis error on critical endpoint, denying request:");
      res.status(503).json({
        error: "Service temporarily unavailable. Please try again shortly.",
      });
      return false;
    }
    // Fail-open: allow on Redis error for general endpoints
    logger.warn({ err: err }, "[RateLimit] Redis error, allowing request:");
    return true;
  }
}

// ─── Express Middleware Factories ─────────────────────────────────────────────

/**
 * Auth rate limiter: 10 requests per 15 minutes per IP.
 * Use on: /api/auth/login, /api/auth/signup, /api/auth/forgot-password
 */
export function authRateLimitMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const ip = getClientIp(req);
  checkLimit(getAuthLimiter(), ip, res, false).then((allowed) => {
    if (allowed) next();
  }).catch(() => next());
}

/**
 * Letter submission rate limiter: 5 requests per hour per user.
 * Identifier is the user's openId from the Authorization header or cookie.
 * Falls back to IP if user ID is unavailable.
 */
export function letterSubmitRateLimitMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Skip rate limiting in development mode
  if (process.env.NODE_ENV === "development") { next(); return; }
  const ip = getClientIp(req);
  // Use IP as identifier for tRPC calls (user ID resolved in procedure)
  checkLimit(getLetterSubmitLimiter(), ip, res).then((allowed) => {
    if (allowed) next();
  }).catch(() => next());
}

/**
 * Payment rate limiter: 10 requests per hour per IP.
 * Use on: /api/trpc/billing.createCheckout, /api/trpc/billing.createLetterUnlock
 */
export function paymentRateLimitMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const ip = getClientIp(req);
  // Fail-closed: deny payment requests when Redis is unavailable
  checkLimit(getPaymentLimiter(), ip, res, false).then((allowed) => {
    if (allowed) next();
  }).catch(() => next());
}

/**
 * General tRPC rate limiter: 60 requests per minute per IP.
 * Use as a broad guard on /api/trpc.
 */
export function generalRateLimitMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const ip = getClientIp(req);
  checkLimit(getGeneralLimiter(), ip, res).then((allowed) => {
    if (allowed) next();
  }).catch(() => next());
}

// ─── tRPC Middleware Helper ───────────────────────────────────────────────────

/**
 * Check rate limit inside a tRPC procedure using the user's openId.
 * Returns true if allowed, throws TRPCError if rate limited.
 */
export async function checkTrpcRateLimit(
  limiterType: "letter" | "payment" | "general" | "document",
  identifier: string,
  failClosed = false
): Promise<void> {
  // Skip rate limiting in development mode
  if (process.env.NODE_ENV === "development") return;
  let limiter: Ratelimit | null;
  switch (limiterType) {
    case "letter":
      limiter = getLetterSubmitLimiter();
      break;
    case "payment":
      limiter = getPaymentLimiter();
      break;
    case "document":
      limiter = getDocumentAnalysisLimiter();
      break;
    default:
      limiter = getGeneralLimiter();
  }

  if (!limiter) {
    if (failClosed) {
      const { TRPCError } = await import("@trpc/server");
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Service temporarily unavailable. Please try again shortly.",
      });
    }
    return;
  }

  try {
    const result = await limiter.limit(identifier);
    if (!result.success) {
      const { TRPCError } = await import("@trpc/server");
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: `Rate limit exceeded. Please wait before trying again.`,
      });
    }
  } catch (err: any) {
    if (err?.code === "TOO_MANY_REQUESTS") throw err;
    if (err?.code === "INTERNAL_SERVER_ERROR") throw err;
    if (failClosed) {
      logger.error({ err: err?.message }, "[RateLimit] Redis error on critical endpoint, denying:");
      const { TRPCError } = await import("@trpc/server");
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Service temporarily unavailable. Please try again shortly.",
      });
    }
    logger.warn({ err: err?.message }, "[RateLimit] tRPC check error, allowing:");
  }
}

// ─── Health Check ─────────────────────────────────────────────────────────────

/**
 * Ping Upstash Redis to verify connectivity.
 * Returns true if connected, false otherwise.
 */
export async function pingRedis(): Promise<boolean> {
  const r = getRedis();
  if (!r) return false;
  try {
    const result = await r.ping();
    return result === "PONG";
  } catch (err) {
    logger.warn({ err: err }, "[RateLimiter] Redis ping failed:");
    return false;
  }
}
