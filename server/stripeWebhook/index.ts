/**
 * Stripe Webhook Handler — Talk-to-My-Lawyer
 *
 * Entry point: signature verification, idempotency dedup, event routing.
 *
 * Sub-handlers:
 *   handlers/checkout.ts     — checkout.session.completed
 *   handlers/subscriptions.ts — subscription lifecycle + invoice events
 */

import type { Request, Response } from "express";
import Stripe from "stripe";
import { ENV } from "../_core/env";
import { getStripe } from "../stripe";
import { getDb } from "../db";
import { processedStripeEvents } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { captureServerException } from "../sentry";
import { stripeLogger } from "./_helpers";
import { handleCheckoutSessionCompleted } from "./handlers/checkout";
import {
  handleSubscriptionCreatedOrUpdated,
  handleSubscriptionDeleted,
  handleInvoicePaid,
  handleInvoicePaymentFailed,
} from "./handlers/subscriptions";

export async function stripeWebhookHandler(req: Request, res: Response): Promise<void> {
  const sig = req.headers["stripe-signature"];

  if (!sig) {
    res.status(400).json({ error: "Missing stripe-signature header" });
    return;
  }

  let event: Stripe.Event;

  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(
      req.body as Buffer,
      sig,
      ENV.stripeWebhookSecret
    );
  } catch (err: any) {
    stripeLogger.error({ err }, "[StripeWebhook] Signature verification failed");
    captureServerException(err, {
      tags: { component: "stripe_webhook", error_type: "signature_verification" },
    });
    res.status(400).json({ error: "Webhook signature verification failed" });
    return;
  }

  // ─── Handle test events ───────────────────────────────────────────────────
  if (event.id.startsWith("evt_test_")) {
    stripeLogger.info({ eventId: event.id }, "[StripeWebhook] Test event detected, returning verification response");
    res.json({ verified: true });
    return;
  }

  stripeLogger.info({ eventType: event.type, eventId: event.id }, "[StripeWebhook] Processing event");

  // ─── Idempotency: skip duplicate events ──────────────────────────────────
  const db = await getDb();
  if (db) {
    const existing = await db
      .select({ eventId: processedStripeEvents.eventId })
      .from(processedStripeEvents)
      .where(eq(processedStripeEvents.eventId, event.id))
      .limit(1);
    if (existing.length > 0) {
      stripeLogger.info({ eventId: event.id }, "[StripeWebhook] Duplicate event, skipping");
      res.json({ received: true, duplicate: true });
      return;
    }
  }

  let responded = false;
  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session);
        break;

      case "customer.subscription.created":
      case "customer.subscription.updated":
        await handleSubscriptionCreatedOrUpdated(event);
        break;

      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event);
        break;

      case "invoice.paid":
        await handleInvoicePaid(event.data.object as Stripe.Invoice);
        break;

      case "invoice.payment_failed":
        await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
        break;

      default:
        stripeLogger.info({ eventType: event.type }, "[StripeWebhook] Unhandled event type");
    }

    // ─── Mark event as processed (idempotency write) ──────────────────────
    if (db) {
      await db.insert(processedStripeEvents).values({
        eventId: event.id,
        eventType: event.type,
      }).onConflictDoNothing();
    }

    res.json({ received: true });
    responded = true;
  } catch (err: any) {
    stripeLogger.error({ err }, "[StripeWebhook] Error processing event");
    captureServerException(err, {
      tags: { component: "stripe_webhook", event_type: event.type },
      extra: { eventId: event.id, eventType: event.type },
    });
    if (!responded) {
      res.status(500).json({ error: "Webhook processing failed" });
    }
  }
}
