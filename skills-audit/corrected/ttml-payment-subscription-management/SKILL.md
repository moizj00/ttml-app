---
name: ttml-payment-subscription-management
description: Complete Stripe payment processing, subscription management, and commission tracking with atomic operations. Use when handling checkouts, webhooks, subscription updates, discount codes, employee commissions, or any payment-related operations in the TTML (Talk-to-My-Lawyer) platform.
---

# Payment & Subscription Management

## Architecture Overview

```
User Purchase Flow:
1. User selects plan → tRPC billing.createCheckout mutation
2. Stripe hosted checkout → User completes payment
3. Stripe webhook (Express endpoint) → checkout.session.completed
4. Atomic RPC → Create/activate subscription + commission ledger entry + usage bump
5. User returns → tRPC billing.verifyPayment mutation (idempotent)
6. Dashboard access → Subscription active, letter submission unlocked
```

**Key Components:**
- **Stripe Checkout** (PCI-compliant hosted payment)
- **Express webhook handler** at `POST /api/stripe/webhook` (raw body, mounted BEFORE `express.json()`)
- **tRPC billing router** (`server/routers/billing/`) for user-initiated flows
- **Atomic RPC functions** in Postgres (prevent race conditions)
- **Commission ledger** (5% employee referral, stored in `commission_ledger`)
- **Discount codes** (variable percent, stored in `discount_codes`)
- **pg-boss queue** for email + commission notifications (non-blocking)

> **Canonical prices** (integer cents in `subscriptions`):
> - **Per-letter:** **$200.00** (`20000` cents), one-time, allowance = 1 letter.
> - **Monthly:** **$200.00** (`20000` cents), recurring monthly, allowance = unlimited (`NULL`).
> - **Annual:** **$2000.00** (`200000` cents), one-time billed yearly, allowance = 48 letters.

---

## Critical Rules (MUST Follow)

1. **[ATOMIC OPERATIONS]** ALL payment database operations MUST use RPC functions with transaction boundaries. NEVER use separate INSERT/UPDATE statements for subscription + commission + discount-code bump.

2. **[IDEMPOTENCY]** Webhook events delivered multiple times MUST produce same result. Always check `webhook_events` table using `check_and_record_webhook` RPC before processing.

3. **[RACE CONDITION PROTECTION]** The `verifyPayment` mutation and the webhook run concurrently. Use `FOR UPDATE SKIP LOCKED` and an `already_completed` flag in the RPC to prevent duplicate subscription activation.

4. **[TEST MODE GUARD]** Production environment MUST use `sk_live_*` Stripe keys. Add startup check: `if (STRIPE_SECRET_KEY.startsWith('sk_test_') && NODE_ENV === 'production') throw new Error('Test mode in production!')`.

5. **[COMMISSION ACCURACY]** Commission rate = `5%` (500 bps). Stored in cents: `commission_amount_cents = floor(final_price_cents * 0.05)`. If `final_price_cents = 0`, DO NOT create a `commission_ledger` row.

6. **[DISCOUNT CODE VALIDATION]** Discount codes are case-insensitive, stored UPPERCASE. Check `is_active = true`, `valid_from <= now() <= valid_until` (if set), and that the code's `plan_type_scope` allows the requested plan. `discount_percent` is variable per code (not a fixed 20%).

7. **[ALLOWANCE PRECISION]** Letter allowances on `subscriptions.remaining_letters`:
   - Monthly (`$200`): `NULL` (unlimited)
   - Annual (`$2000`): `48` (4 per month × 12)
   - Per-letter (`$200`): `1`

8. **[WEBHOOK SECURITY]** ALWAYS verify signature: `stripe.webhooks.constructEvent(rawBody, signature, secret)`. Reject unverified with `400`. The Stripe webhook route MUST receive the raw body — mount BEFORE `express.json()`.

9. **[EMAIL NON-BLOCKING]** ALL emails use `queueTemplateEmail` (Resend + pg-boss). NEVER block webhook on email delivery.

10. **[STRIPE METADATA]** Store ALL transaction context in Stripe session metadata: `user_id`, `plan_type`, `letters`, base/final/discount cents, `discount_code`, `employee_id`. The webhook has no other way to recover this.

11. **[RBAC]** `billing.createCheckout` / `billing.verifyPayment` use `subscriberProcedure` (any authenticated non-banned user). Commission reads use `employeeProcedure`. Ledger adjustments use `adminProcedure`.

12. **[PROHIBITED]** Never store PANs, CVVs, or raw bank data. Stripe holds all card data. Card BIN / last-4 are only displayed from Stripe API responses — never persisted in TTML tables beyond what Stripe already returns in `payment_method` snapshots.

---

## Plan Configuration

### Available Plans

| Plan | Price (cents) | Billing | Allowance | Stripe Product | Discount-Code Eligible |
|------|---------------|---------|-----------|----------------|------------------------|
| `per-letter` | `20000` ($200) | One-time | `1` letter | `prod_letter_single` | Yes (employee codes) |
| `monthly` | `20000` ($200/mo) | Monthly subscription | `NULL` (unlimited) | `prod_subscription_monthly` | No |
| `annual` | `200000` ($2000/yr) | One-time (yearly) | `48` letters | `prod_subscription_annual` | No |

> **Price source of truth:** `shared/config/pricing.ts` — integer cents only. Do not hard-code dollars.

### Stripe Metadata Structure

**CRITICAL:** Metadata required for webhook processing (Stripe session has no database access).

```typescript
type CheckoutMetadata = {
  // User identification
  user_id: string;                    // UUID of subscriber

  // Plan details
  plan_type: 'per-letter' | 'monthly' | 'annual';
  letters: '1' | 'unlimited' | '48';

  // Pricing breakdown (integer cents as strings — Stripe metadata is string-only)
  base_price_cents: string;           // e.g., "20000"
  discount_cents: string;             // e.g., "4000"
  final_price_cents: string;          // e.g., "16000"
  discount_percent: string;           // e.g., "20"

  // Referral tracking (optional)
  discount_code: string;              // Employee discount code (if used)
  employee_id: string;                // Referring employee UUID (if applicable)
};
```

---

## Phase 1: Checkout Session Creation

### tRPC Procedure: `billing.createCheckout`

Located in `server/routers/billing/createCheckout.ts`. Uses `subscriberProcedure` middleware.

**Input schema:**

```typescript
// server/routers/billing/schemas.ts
import { z } from 'zod';

export const createCheckoutInput = z.object({
  planType: z.enum(['per-letter', 'monthly', 'annual']),
  discountCode: z.string().trim().max(64).optional(),
});
```

**Procedure body (high level):**

```typescript
// server/routers/billing/createCheckout.ts
import { TRPCError } from '@trpc/server';
import { subscriberProcedure } from '../../trpc';
import { createCheckoutInput } from './schemas';
import { checkoutRateLimit } from '../../rateLimit'; // @upstash/ratelimit
import { db } from '../../db';
import { subscriptions, discountCodes, users } from '../../db/schema';
import { eq, and } from 'drizzle-orm';
import { stripe } from '../../stripe';
import { PLAN_PRICES_CENTS, PLAN_ALLOWANCE } from '../../../shared/config/pricing';

export const createCheckout = subscriberProcedure
  .input(createCheckoutInput)
  .mutation(async ({ ctx, input }) => {
    const { user } = ctx;

    // 1. Rate limit
    const rl = await checkoutRateLimit.limit(`checkout:${user.id}`);
    if (!rl.success) {
      throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'Too many checkout attempts' });
    }

    // 2. Existing active subscription check (monthly/annual block, per-letter allowed alongside)
    const [existingSub] = await db
      .select({ id: subscriptions.id, planType: subscriptions.planType, status: subscriptions.status })
      .from(subscriptions)
      .where(and(eq(subscriptions.userId, user.id), eq(subscriptions.status, 'active')))
      .limit(1);

    if (existingSub && existingSub.planType !== 'per-letter') {
      throw new TRPCError({ code: 'CONFLICT', message: 'Active subscription already exists' });
    }

    // 3. Resolve pricing (integer cents, no floats)
    const basePriceCents = PLAN_PRICES_CENTS[input.planType]; // 20000 | 20000 | 200000
    let discountCents = 0;
    let discountPercent = 0;
    let employeeId: string | null = null;

    if (input.discountCode) {
      const normalized = input.discountCode.trim().toUpperCase();

      const [code] = await db
        .select()
        .from(discountCodes)
        .where(and(eq(discountCodes.code, normalized), eq(discountCodes.isActive, true)))
        .limit(1);

      if (!code) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid or inactive discount code' });
      }

      // Plan-type scope check: employee codes are per-letter only by default
      if (code.planTypeScope && code.planTypeScope !== input.planType) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Discount code not valid for ${input.planType}`,
        });
      }

      // Validity window
      const now = new Date();
      if (code.validFrom && code.validFrom > now) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Discount code not yet active' });
      }
      if (code.validUntil && code.validUntil < now) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Discount code expired' });
      }

      discountPercent = code.discountPercent; // integer, 1-100
      discountCents = Math.floor((basePriceCents * discountPercent) / 100);
      employeeId = code.employeeId ?? null;
    }

    const finalPriceCents = Math.max(0, basePriceCents - discountCents);

    // 4. Create pending subscription row
    const [pending] = await db
      .insert(subscriptions)
      .values({
        userId: user.id,
        status: 'pending',
        planType: input.planType,
        priceCents: basePriceCents,
        discountCents,
        finalPriceCents,
        remainingLetters: PLAN_ALLOWANCE[input.planType], // null | 1 | 48
        stripeSessionId: null,
        stripeCustomerId: user.stripeCustomerId ?? null,
      })
      .returning({ id: subscriptions.id });

    // 5. Ensure Stripe customer
    let stripeCustomerId = user.stripeCustomerId;
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.fullName ?? undefined,
        metadata: { user_id: user.id },
      });
      stripeCustomerId = customer.id;
      await db.update(users).set({ stripeCustomerId }).where(eq(users.id, user.id));
    }

    // 6. Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: input.planType === 'monthly' ? 'subscription' : 'payment',
      line_items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount: finalPriceCents, // already in cents
            product_data: {
              name: PLAN_NAMES[input.planType],
              description: PLAN_DESCRIPTIONS[input.planType],
            },
            ...(input.planType === 'monthly' && { recurring: { interval: 'month' } }),
          },
          quantity: 1,
        },
      ],
      success_url: `${process.env.SITE_URL}/dashboard?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.SITE_URL}/pricing?canceled=true`,
      metadata: {
        user_id: user.id,
        plan_type: input.planType,
        letters:
          input.planType === 'per-letter' ? '1' : input.planType === 'monthly' ? 'unlimited' : '48',
        base_price_cents: String(basePriceCents),
        discount_cents: String(discountCents),
        final_price_cents: String(finalPriceCents),
        discount_percent: String(discountPercent),
        discount_code: input.discountCode ? input.discountCode.toUpperCase() : '',
        employee_id: employeeId ?? '',
      },
      payment_intent_data:
        input.planType !== 'monthly'
          ? { metadata: { user_id: user.id, plan_type: input.planType } }
          : undefined,
      allow_promotion_codes: false, // we use first-party discount_codes
      billing_address_collection: 'required',
      phone_number_collection: { enabled: true },
    });

    // 7. Link session ID to pending subscription
    await db
      .update(subscriptions)
      .set({ stripeSessionId: session.id })
      .where(eq(subscriptions.id, pending.id));

    return { url: session.url };
  });
```

### Test Mode Bypass (Development Only)

```typescript
// server/routers/billing/createCheckout.ts (dev branch)
if (process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_')) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('CRITICAL: Test mode Stripe key detected in production!');
  }

  // Skip Stripe — directly activate a $0 subscription via atomic RPC
  const { data, error } = await ctx.supabase.rpc('create_free_subscription', {
    p_user_id: user.id,
    p_plan_type: input.planType,
    p_remaining_letters: PLAN_ALLOWANCE[input.planType],
    p_base_price_cents: basePriceCents,
    p_discount_cents: discountCents,
    p_final_price_cents: 0,
    p_discount_code: input.discountCode ?? null,
    p_employee_id: employeeId,
    p_commission_cents: 0,
  });

  if (error) throw error;
  return { success: true, subscriptionId: data[0].subscription_id, testMode: true };
}
```

---

## Phase 2: Stripe Webhook Handling

The Stripe webhook is **NOT** a tRPC procedure — it's a raw Express route because Stripe needs the unmodified request body to verify the signature.

### Express Route: `POST /api/stripe/webhook`

```typescript
// server/routes/stripeWebhook.ts
import type { Request, Response } from 'express';
import express from 'express';
import { stripe } from '../stripe';
import { supabaseAdmin } from '../supabase';
import { queueTemplateEmail } from '../email/queue';
import type Stripe from 'stripe';

export const stripeWebhookRouter = express.Router();

// IMPORTANT: mount this router BEFORE app.use(express.json())
stripeWebhookRouter.post(
  '/api/stripe/webhook',
  express.raw({ type: 'application/json' }),
  async (req: Request, res: Response) => {
    const signature = req.headers['stripe-signature'] as string | undefined;
    if (!signature) return res.status(400).send('Missing stripe-signature');

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(
        req.body, // raw Buffer because of express.raw()
        signature,
        process.env.STRIPE_WEBHOOK_SECRET!,
      );
    } catch (err) {
      console.error('[Webhook] Signature verification failed:', err);
      return res.status(400).send('Webhook signature verification failed');
    }

    // Idempotency check
    const { data: idem } = await supabaseAdmin.rpc('check_and_record_webhook', {
      p_stripe_event_id: event.id,
      p_event_type: event.type,
      p_metadata: {
        created: event.created,
        api_version: event.api_version,
        livemode: event.livemode,
      },
    });

    if (idem?.[0]?.already_processed) {
      return res.json({ received: true, already_processed: true });
    }

    try {
      switch (event.type) {
        case 'checkout.session.completed':
          await handleCheckoutCompleted(event);
          break;
        case 'checkout.session.expired':
          await handleCheckoutExpired(event);
          break;
        case 'customer.subscription.updated':
          await handleSubscriptionUpdated(event);
          break;
        case 'customer.subscription.deleted':
          await handleSubscriptionDeleted(event);
          break;
        case 'invoice.payment_failed':
          await handleInvoicePaymentFailed(event);
          break;
        default:
          // Unhandled — still return 200 so Stripe doesn't retry forever
          break;
      }
      return res.json({ received: true });
    } catch (err) {
      console.error('[Webhook] Handler failed:', event.type, err);
      // Return 500 so Stripe retries; idempotency RPC will short-circuit the second attempt
      return res.status(500).send('Handler error');
    }
  },
);
```

### Event: `checkout.session.completed`

```typescript
async function handleCheckoutCompleted(event: Stripe.Event) {
  const session = event.data.object as Stripe.Checkout.Session;

  if (session.payment_status !== 'paid') return;

  const metadata = session.metadata ?? {};
  const {
    user_id,
    plan_type,
    letters,
    base_price_cents,
    discount_cents,
    final_price_cents,
    discount_code,
    employee_id,
  } = metadata;

  if (!user_id || !plan_type) throw new Error('Missing required metadata');

  const lettersOrNull = letters === 'unlimited' ? null : parseInt(letters!, 10);

  const { data, error } = await supabaseAdmin.rpc('verify_and_complete_subscription', {
    p_user_id: user_id,
    p_stripe_session_id: session.id,
    p_stripe_customer_id: session.customer as string,
    p_plan_type: plan_type,
    p_remaining_letters: lettersOrNull,
    p_base_price_cents: parseInt(base_price_cents ?? '0', 10),
    p_discount_cents: parseInt(discount_cents ?? '0', 10),
    p_final_price_cents: parseInt(final_price_cents ?? '0', 10),
    p_discount_code: discount_code || null,
    p_employee_id: employee_id || null,
    p_commission_bps: 500, // 5% in basis points
  });

  if (error || !data?.[0]?.success) {
    throw new Error(error?.message ?? 'Failed to activate subscription');
  }

  const { subscription_id, commission_id, already_completed } = data[0];
  if (already_completed) return;

  // Non-blocking email notifications (pg-boss queue)
  const { data: userProfile } = await supabaseAdmin
    .from('users')
    .select('email, full_name')
    .eq('id', user_id)
    .single();

  if (userProfile?.email) {
    queueTemplateEmail('subscription-confirmation', userProfile.email, {
      userName: userProfile.full_name ?? 'there',
      planType: plan_type,
      amountPaidCents: parseInt(final_price_cents ?? '0', 10),
      actionUrl: `${process.env.SITE_URL}/dashboard`,
    }).catch((err) => console.error('[Webhook] User email failed:', err));
  }

  // Commission notification
  if (commission_id && employee_id && parseInt(final_price_cents ?? '0', 10) > 0) {
    const { data: employeeProfile } = await supabaseAdmin
      .from('users')
      .select('email, full_name')
      .eq('id', employee_id)
      .single();

    if (employeeProfile?.email) {
      const commissionCents = Math.floor((parseInt(final_price_cents!, 10) * 500) / 10000);
      queueTemplateEmail('commission-earned', employeeProfile.email, {
        userName: employeeProfile.full_name ?? 'there',
        saleAmountCents: parseInt(final_price_cents!, 10),
        commissionAmountCents: commissionCents,
        commissionRate: '5%',
        actionUrl: `${process.env.SITE_URL}/employee/commissions`,
      }).catch((err) => console.error('[Webhook] Commission email failed:', err));
    }
  }
}
```

### Event: `checkout.session.expired`

```typescript
async function handleCheckoutExpired(event: Stripe.Event) {
  const session = event.data.object as Stripe.Checkout.Session;
  const userId = session.metadata?.user_id;
  if (!userId) return;

  await supabaseAdmin
    .from('subscriptions')
    .update({ status: 'canceled', updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('stripe_session_id', session.id)
    .eq('status', 'pending');
}
```

### Event: `customer.subscription.updated`

Applies only to the `monthly` recurring plan.

```typescript
async function handleSubscriptionUpdated(event: Stripe.Event) {
  const sub = event.data.object as Stripe.Subscription;
  const customerId = sub.customer as string;

  const statusMap: Record<string, string> = {
    active: 'active',
    trialing: 'active',
    past_due: 'past_due',
    unpaid: 'past_due',
    canceled: 'canceled',
    incomplete: 'pending',
    incomplete_expired: 'canceled',
  };
  const dbStatus = statusMap[sub.status] ?? 'active';

  await supabaseAdmin
    .from('subscriptions')
    .update({
      status: dbStatus,
      stripe_subscription_id: sub.id,
      current_period_end: sub.current_period_end
        ? new Date(sub.current_period_end * 1000).toISOString()
        : null,
      updated_at: new Date().toISOString(),
    })
    .eq('stripe_customer_id', customerId)
    .eq('plan_type', 'monthly');
}
```

### Event: `customer.subscription.deleted`

```typescript
async function handleSubscriptionDeleted(event: Stripe.Event) {
  const sub = event.data.object as Stripe.Subscription;

  await supabaseAdmin
    .from('subscriptions')
    .update({ status: 'canceled', updated_at: new Date().toISOString() })
    .eq('stripe_customer_id', sub.customer as string)
    .eq('stripe_subscription_id', sub.id);

  // Notify user (non-blocking)
  const { data } = await supabaseAdmin
    .from('subscriptions')
    .select('users(email, full_name)')
    .eq('stripe_subscription_id', sub.id)
    .single();
  const profile = (data as any)?.users;

  if (profile?.email) {
    queueTemplateEmail('subscription-canceled', profile.email, {
      userName: profile.full_name ?? 'there',
      reactivateUrl: `${process.env.SITE_URL}/pricing`,
    }).catch((err) => console.error('[Webhook] Cancellation email failed:', err));
  }
}
```

### Event: `invoice.payment_failed`

Moves monthly subscription to `past_due`, surfaces a dunning email, and does NOT revoke access immediately — Stripe retries per dunning schedule.

```typescript
async function handleInvoicePaymentFailed(event: Stripe.Event) {
  const invoice = event.data.object as Stripe.Invoice;
  const customerId = invoice.customer as string;

  await supabaseAdmin
    .from('subscriptions')
    .update({ status: 'past_due', updated_at: new Date().toISOString() })
    .eq('stripe_customer_id', customerId)
    .eq('plan_type', 'monthly');

  const { data } = await supabaseAdmin
    .from('users')
    .select('email, full_name')
    .eq('stripe_customer_id', customerId)
    .single();

  if (data?.email) {
    queueTemplateEmail('payment-failed', data.email, {
      userName: data.full_name ?? 'there',
      retryUrl: `${process.env.SITE_URL}/billing/update-payment`,
    }).catch((err) => console.error('[Webhook] Dunning email failed:', err));
  }
}
```

---

## Phase 3: Payment Verification (User-Initiated)

### tRPC Procedure: `billing.verifyPayment`

Called by the client after Stripe redirects to the `success_url`. Runs in parallel with the webhook; relies on the same atomic RPC for race safety.

```typescript
// server/routers/billing/verifyPayment.ts
import { TRPCError } from '@trpc/server';
import { subscriberProcedure } from '../../trpc';
import { z } from 'zod';
import { stripe } from '../../stripe';

export const verifyPayment = subscriberProcedure
  .input(z.object({ sessionId: z.string().min(1) }))
  .mutation(async ({ ctx, input }) => {
    const { user } = ctx;

    const session = await stripe.checkout.sessions.retrieve(input.sessionId);

    if (session.payment_status !== 'paid') {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Payment not completed' });
    }
    if (session.metadata?.user_id !== user.id) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Session does not belong to this user' });
    }

    const metadata = session.metadata;
    const { data, error } = await ctx.supabaseAdmin.rpc('verify_and_complete_subscription', {
      p_user_id: user.id,
      p_stripe_session_id: input.sessionId,
      p_stripe_customer_id: session.customer as string,
      p_plan_type: metadata.plan_type!,
      p_remaining_letters: metadata.letters === 'unlimited' ? null : parseInt(metadata.letters!, 10),
      p_base_price_cents: parseInt(metadata.base_price_cents ?? '0', 10),
      p_discount_cents: parseInt(metadata.discount_cents ?? '0', 10),
      p_final_price_cents: parseInt(metadata.final_price_cents ?? '0', 10),
      p_discount_code: metadata.discount_code || null,
      p_employee_id: metadata.employee_id || null,
      p_commission_bps: 500,
    });

    if (error || !data?.[0]?.success) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: error?.message ?? 'Activation failed',
      });
    }

    const { subscription_id, already_completed } = data[0];
    return {
      success: true,
      subscriptionId: subscription_id,
      message: already_completed
        ? 'Subscription already activated by webhook'
        : 'Subscription activated successfully',
    };
  });
```

---

## Atomic RPC Functions

### Function: `verify_and_complete_subscription`

Atomically:
1. Claims the `pending` subscription for this session (`FOR UPDATE SKIP LOCKED`)
2. Activates it
3. Inserts a `commission_ledger` row when `employee_id IS NOT NULL` and `final_price_cents > 0`
4. Bumps `discount_codes.usage_count` and records `discount_code_usage`

```sql
CREATE OR REPLACE FUNCTION public.verify_and_complete_subscription(
  p_user_id            UUID,
  p_stripe_session_id  TEXT,
  p_stripe_customer_id TEXT,
  p_plan_type          TEXT,
  p_remaining_letters  INTEGER,
  p_base_price_cents   INTEGER,
  p_discount_cents     INTEGER,
  p_final_price_cents  INTEGER,
  p_discount_code      TEXT,
  p_employee_id        UUID,
  p_commission_bps     INTEGER  -- basis points; 500 = 5%
)
RETURNS TABLE(
  success             BOOLEAN,
  subscription_id     UUID,
  commission_id       UUID,
  coupon_usage_count  INTEGER,
  error_message       TEXT,
  already_completed   BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_subscription_id    UUID;
  v_commission_id      UUID;
  v_coupon_usage_count INTEGER;
  v_rows_updated       INTEGER;
  v_commission_cents   INTEGER;
BEGIN
  -- 1. Race-safe claim of the pending row
  UPDATE public.subscriptions s
  SET
    status             = 'active',
    stripe_session_id  = p_stripe_session_id,
    stripe_customer_id = p_stripe_customer_id,
    activated_at       = NOW(),
    updated_at         = NOW()
  WHERE s.id = (
    SELECT id FROM public.subscriptions
    WHERE user_id = p_user_id
      AND status  = 'pending'
      AND (stripe_session_id IS NULL OR stripe_session_id = p_stripe_session_id)
    ORDER BY created_at DESC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  RETURNING s.id INTO v_subscription_id;

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

  -- 2. If no pending row was claimable, check whether another actor already activated it
  IF v_rows_updated = 0 OR v_subscription_id IS NULL THEN
    SELECT id INTO v_subscription_id
    FROM public.subscriptions
    WHERE stripe_session_id = p_stripe_session_id
      AND status = 'active';

    IF v_subscription_id IS NOT NULL THEN
      RETURN QUERY SELECT TRUE, v_subscription_id, NULL::UUID,
                          NULL::INTEGER, NULL::TEXT, TRUE;
      RETURN;
    ELSE
      RAISE EXCEPTION 'No pending subscription found for session %', p_stripe_session_id;
    END IF;
  END IF;

  -- 3. Commission ledger entry (only when employee referral + paid)
  IF p_employee_id IS NOT NULL AND p_final_price_cents > 0 THEN
    v_commission_cents := FLOOR((p_final_price_cents::BIGINT * p_commission_bps) / 10000);

    INSERT INTO public.commission_ledger (
      employee_id,
      subscription_id,
      subscription_amount_cents,
      commission_bps,
      commission_amount_cents,
      status,
      created_at
    ) VALUES (
      p_employee_id,
      v_subscription_id,
      p_final_price_cents,
      p_commission_bps,
      v_commission_cents,
      'pending',
      NOW()
    )
    ON CONFLICT (subscription_id) DO NOTHING  -- one commission per subscription
    RETURNING id INTO v_commission_id;
  END IF;

  -- 4. Discount-code bookkeeping
  IF p_discount_code IS NOT NULL THEN
    UPDATE public.discount_codes
    SET usage_count = usage_count + 1,
        updated_at  = NOW()
    WHERE code = UPPER(p_discount_code)
      AND is_active = TRUE
    RETURNING usage_count INTO v_coupon_usage_count;

    INSERT INTO public.discount_code_usage (
      user_id,
      code,
      employee_id,
      subscription_id,
      plan_type,
      discount_percent,
      amount_before_cents,
      amount_after_cents,
      created_at
    ) VALUES (
      p_user_id,
      UPPER(p_discount_code),
      p_employee_id,
      v_subscription_id,
      p_plan_type,
      CASE WHEN p_base_price_cents > 0
           THEN (p_discount_cents::NUMERIC / p_base_price_cents::NUMERIC * 100)::INTEGER
           ELSE 0 END,
      p_base_price_cents,
      p_final_price_cents,
      NOW()
    )
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN QUERY SELECT TRUE, v_subscription_id, v_commission_id,
                      v_coupon_usage_count, NULL::TEXT, FALSE;

EXCEPTION
  WHEN OTHERS THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID,
                        NULL::INTEGER, SQLERRM::TEXT, FALSE;
END;
$$;
```

### Function: `check_and_record_webhook`

```sql
CREATE OR REPLACE FUNCTION public.check_and_record_webhook(
  p_stripe_event_id TEXT,
  p_event_type      TEXT,
  p_metadata        JSONB
)
RETURNS TABLE(already_processed BOOLEAN, event_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id UUID;
BEGIN
  SELECT id INTO v_event_id
  FROM public.webhook_events
  WHERE stripe_event_id = p_stripe_event_id;

  IF v_event_id IS NOT NULL THEN
    RETURN QUERY SELECT TRUE, v_event_id;
  ELSE
    INSERT INTO public.webhook_events (stripe_event_id, event_type, metadata, processed_at)
    VALUES (p_stripe_event_id, p_event_type, p_metadata, NOW())
    RETURNING id INTO v_event_id;

    RETURN QUERY SELECT FALSE, v_event_id;
  END IF;
END;
$$;
```

> **Migration location:** All of the above SQL is version-controlled via Drizzle. Create a new migration (`drizzle/NNNN_verify_and_complete_subscription.sql`) and update the Drizzle journal. Never hand-edit the production DB.

---

## Entitlement Gate on Letter Creation

Letter submission (`letters.submit`) MUST atomically claim an allowance slot before advancing the status machine to `submitted`. Use a DB function (NOT application code) to avoid double-spend under concurrent tabs:

```sql
-- Consumes exactly 1 unit of allowance from the user's active subscription.
-- Returns FALSE if no active subscription or allowance exhausted.
CREATE OR REPLACE FUNCTION public.claim_letter_allowance(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub_id UUID;
BEGIN
  SELECT id INTO v_sub_id
  FROM public.subscriptions
  WHERE user_id = p_user_id
    AND status = 'active'
    AND (remaining_letters IS NULL OR remaining_letters > 0)
  ORDER BY
    (plan_type = 'monthly') DESC,  -- prefer unlimited
    created_at DESC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_sub_id IS NULL THEN
    RETURN FALSE;
  END IF;

  UPDATE public.subscriptions
  SET remaining_letters = CASE
        WHEN remaining_letters IS NULL THEN NULL  -- unlimited stays unlimited
        ELSE remaining_letters - 1
      END,
      updated_at = NOW()
  WHERE id = v_sub_id;

  RETURN TRUE;
END;
$$;
```

The `letters.submit` tRPC procedure calls this RPC first; only on `TRUE` does it create the `letter_request` and transition the status machine.

---

## Testing Checklist

### Unit Tests (Vitest)
- [ ] Discount-code validation rejects inactive / out-of-window / wrong-scope codes
- [ ] Discount math accurate in **cents** (`20% of 20000 = 4000`, final = `16000`)
- [ ] Commission math in cents (`5% of 16000 = 800`)
- [ ] Pending subscription created before Stripe checkout call
- [ ] Metadata includes all required fields as strings
- [ ] Price source is `shared/config/pricing.ts` (no hard-coded dollars in procedure code)

### Integration Tests (tRPC `createCaller` + supabase test project)
- [ ] End-to-end: `createCheckout` → simulated Stripe webhook → active subscription + commission ledger row
- [ ] `verifyPayment` and webhook don't create duplicate subscriptions
- [ ] Idempotency: same `event.id` delivered twice returns `already_processed`
- [ ] Commission row created only when `final_price_cents > 0`
- [ ] `discount_codes.usage_count` increments atomically
- [ ] `claim_letter_allowance` returns `FALSE` for exhausted per-letter plan

### Race Condition Tests
- [ ] Concurrent `verifyPayment` + webhook → single active subscription, `already_completed=true` on the loser
- [ ] `FOR UPDATE SKIP LOCKED` prevents double-activation
- [ ] Concurrent `letters.submit` calls on a 1-letter plan → exactly one succeeds

### Security Tests
- [ ] Webhook signature verification rejects tampered requests
- [ ] Test mode guard blocks `sk_test_*` in `NODE_ENV=production`
- [ ] User can only call `verifyPayment` on sessions where `metadata.user_id === ctx.user.id`
- [ ] RLS prevents cross-user reads of `subscriptions`, `commission_ledger`, `discount_code_usage`
- [ ] Super admin powers do NOT come from a DB column — they come from the app-side whitelist in `server/supabaseAuth.ts`

---

## Monitoring & Alerts

**Critical Metrics:**
- Checkout creation success rate (target: `>90%`)
- Webhook handler latency (target: `<2s` p95)
- `verifyPayment` success rate (target: `>95%`)
- Duplicate active subscriptions per user (target: `0`)
- Commission ledger entries created per paid checkout (target: `1:1` for referred flows)

**Alert Conditions (Sentry + Railway metrics):**
- Checkout failures `>10%` in 1 hour → Check Stripe API / rate limits
- Webhook failures `>5%` → Investigate signature mismatch or env drift
- Duplicate active subscriptions detected → Page on-call engineer
- Commission creation failure → Alert finance team
- `sk_test_*` key observed in production → CRITICAL + auto-deploy revert via Railway

---

## Related Skills

- **`ttml-database-rls-security`** — canonical schema for `subscriptions`, `commission_ledger`, `discount_codes`, `webhook_events`, and their RLS policies.
- **`ttml-backend-patterns`** — tRPC router composition, `subscriberProcedure` / `employeeProcedure` / `adminProcedure`, Upstash rate limit helper, pg-boss queue wiring.
- **`ttml-pipeline-expert`** — how `claim_letter_allowance` interacts with the status machine.
- **`ttml-code-review-qa`** — PR-level checklist covering Stripe metadata, idempotency, and price-in-cents discipline.
