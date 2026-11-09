import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { planConfig, type BillingInterval } from "@/lib/config";
import { getAuth } from "./auth";

/**
 * Billing with Paystack (NGN). Pro is billed monthly
 * (NEXT_PUBLIC_ISOLA_PRO_PRICE_NGN, default ₦14,000) or yearly
 * (NEXT_PUBLIC_ISOLA_PRO_YEARLY_PRICE_NGN, default ₦140,000). Both give the
 * same Pro features.
 *
 * - Without PAYSTACK_SECRET_KEY, upgrading is reported as unavailable.
 * - With PAYSTACK_PLAN_CODE / PAYSTACK_YEARLY_PLAN_CODE (plans created in the
 *   Paystack dashboard), checkout starts a subscription that renews
 *   automatically; every successful charge extends Pro by one period.
 * - Without a plan code, each payment buys one period of Pro (no auto-renew).
 *
 * A payment only grants Pro after the server verifies it with Paystack's API
 * (amount, currency and which account it belongs to). Payments are recorded
 * by reference, so a callback and a webhook for the same charge count once.
 */

export const PRO_PRICE_NGN = planConfig.proPriceNgn;

export const INTERVALS: Record<BillingInterval, { priceNgn: number; days: number; envPlanCode: string }> = {
  monthly: { priceNgn: planConfig.proPriceNgn, days: 30, envPlanCode: "PAYSTACK_PLAN_CODE" },
  yearly: { priceNgn: planConfig.proYearlyPriceNgn, days: 365, envPlanCode: "PAYSTACK_YEARLY_PLAN_CODE" },
};

export function isInterval(value: unknown): value is BillingInterval {
  return value === "monthly" || value === "yearly";
}

function planCodeFor(interval: BillingInterval) {
  return process.env[INTERVALS[interval].envPlanCode] || null;
}

/** Pages a payer may be sent back to after checkout. */
const RETURN_PATHS = new Set(["/account", "/batch", "/editor", "/pricing"]);
export function safeReturnPath(value: unknown): string | null {
  return typeof value === "string" && RETURN_PATHS.has(value) ? value : null;
}

const API_BASE = (process.env.PAYSTACK_API_BASE || "https://api.paystack.co").replace(/\/$/, "");
const PRODUCT = "isola-pro";

export function billingConfigured() {
  return Boolean(process.env.PAYSTACK_SECRET_KEY);
}

export function renewsAutomatically(interval: BillingInterval = "monthly") {
  return Boolean(planCodeFor(interval));
}

export interface PlanState {
  pro: boolean;
  proUntil: string | null;
  renews: boolean;
}

export function planOf(user: { proUntil?: Date | string | null; proRenews?: boolean | null }): PlanState {
  const until = user.proUntil ? new Date(user.proUntil) : null;
  const pro = Boolean(until && until.getTime() > Date.now());
  return { pro, proUntil: until ? until.toISOString() : null, renews: pro && Boolean(user.proRenews) };
}

export class BillingError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

async function paystack<T>(path: string, init: RequestInit = {}): Promise<T> {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw new BillingError("Payments aren't set up on this deployment.", 503);
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new BillingError("Couldn't reach the payment provider. Please try again.", 502);
  }
  const json = (await response.json().catch(() => null)) as { status?: boolean; message?: string; data?: T } | null;
  if (!response.ok || !json?.status || json.data === undefined) {
    throw new BillingError(json?.message ? `Payment provider: ${json.message}` : "The payment provider returned an error.", 502);
  }
  return json.data;
}

/** Start Paystack checkout for the signed-in user; returns the hosted payment page URL. */
export async function startCheckout({
  userId,
  email,
  origin,
  interval = "monthly",
  returnTo = null,
}: {
  userId: string;
  email: string;
  origin: string;
  interval?: BillingInterval;
  returnTo?: string | null;
}) {
  const reference = `isola_${randomBytes(12).toString("hex")}`;
  const planCode = planCodeFor(interval);
  const data = await paystack<{ authorization_url: string; reference: string }>("/transaction/initialize", {
    method: "POST",
    body: JSON.stringify({
      email,
      amount: INTERVALS[interval].priceNgn * 100,
      currency: "NGN",
      reference,
      callback_url: `${origin}/billing/callback`,
      metadata: { userId, product: PRODUCT, interval, ...(returnTo ? { returnTo } : {}) },
      ...(planCode ? { plan: planCode } : {}),
    }),
  });
  return { url: data.authorization_url, reference: data.reference };
}

interface Transaction {
  status: string;
  reference: string;
  amount: number;
  currency: string;
  paid_at?: string | null;
  paidAt?: string | null;
  metadata?: unknown;
  customer?: { customer_code?: string; email?: string };
  plan?: unknown;
}

type Metadata = { userId?: string; product?: string; interval?: string; returnTo?: string };

function metadataOf(tx: Transaction): Metadata {
  let meta = tx.metadata;
  if (typeof meta === "string") {
    try {
      meta = JSON.parse(meta);
    } catch {
      meta = null;
    }
  }
  return meta && typeof meta === "object" ? (meta as Metadata) : {};
}

/** Paystack reports the plan as a code string or as an object with plan_code. */
function planCodeOf(tx: Transaction): string | null {
  if (typeof tx.plan === "string") return tx.plan || null;
  if (tx.plan && typeof tx.plan === "object" && "plan_code" in tx.plan) return String((tx.plan as { plan_code?: unknown }).plan_code ?? "") || null;
  return null;
}

/** Which of our plans a subscription charge belongs to, or null. */
function intervalForPlanCode(code: string | null): BillingInterval | null {
  if (!code) return null;
  for (const interval of ["monthly", "yearly"] as const) if (planCodeFor(interval) === code) return interval;
  return null;
}

async function context() {
  const auth = await getAuth();
  return auth.$context;
}

/**
 * Record a verified payment and extend Pro by one period. Idempotent: the
 * payment row is created first with a unique reference, so a repeat (callback
 * plus webhook, or a reload) fails there and changes nothing.
 */
async function grantPro(userId: string, tx: Transaction, paidAt: Date, interval: BillingInterval) {
  const ctx = await context();
  const existing = await ctx.adapter.findOne({ model: "payment", where: [{ field: "reference", value: tx.reference }] });
  if (existing) return { granted: false as const };
  try {
    await ctx.adapter.create({
      model: "payment",
      data: { reference: tx.reference, userId, amount: tx.amount, currency: tx.currency, paidAt, provider: "paystack" },
    });
  } catch {
    return { granted: false as const };
  }
  const user = (await ctx.internalAdapter.findUserById(userId)) as { proUntil?: Date | string | null } | null;
  if (!user) return { granted: false as const };
  const current = user.proUntil ? new Date(user.proUntil).getTime() : 0;
  const start = Math.max(Date.now(), current);
  const proUntil = new Date(start + INTERVALS[interval].days * 24 * 60 * 60 * 1000);
  await ctx.internalAdapter.updateUser(userId, {
    plan: "pro",
    proUntil,
    proInterval: interval,
    proRenews: renewsAutomatically(interval),
    ...(tx.customer?.customer_code ? { paystackCustomerCode: tx.customer.customer_code } : {}),
  });
  return { granted: true as const, proUntil };
}

/**
 * Verify a transaction with Paystack and, if it's a valid Pro payment, grant
 * Pro for its billing period. First payments carry our metadata (account,
 * interval); automatic subscription renewals don't, so those are matched by
 * the plan code and the Paystack customer instead.
 */
export async function verifyAndGrant(reference: string, expectedUserId?: string) {
  if (!/^[\w-]{6,100}$/.test(reference)) throw new BillingError("Invalid payment reference.");
  const tx = await paystack<Transaction>(`/transaction/verify/${encodeURIComponent(reference)}`);
  const meta = metadataOf(tx);
  if (tx.status !== "success") throw new BillingError("This payment wasn't completed.", 402);
  const renewalInterval = intervalForPlanCode(planCodeOf(tx));
  let userId: string | null = null;
  let interval: BillingInterval;
  if (meta.product === PRODUCT && meta.userId) {
    userId = meta.userId;
    interval = isInterval(meta.interval) ? meta.interval : "monthly";
  } else if (renewalInterval) {
    userId = await userByCustomer(tx.customer?.customer_code, tx.customer?.email);
    interval = renewalInterval;
  } else {
    throw new BillingError("This payment isn't for ISOLA Pro.", 400);
  }
  if (!userId) throw new BillingError("This payment isn't linked to an ISOLA account.", 400);
  if (tx.currency !== "NGN" || Number(tx.amount) < INTERVALS[interval].priceNgn * 100) {
    throw new BillingError("This payment doesn't match the Pro price.", 402);
  }
  if (expectedUserId && userId !== expectedUserId) throw new BillingError("This payment belongs to a different account.", 403);
  const paidAt = new Date(tx.paid_at ?? tx.paidAt ?? Date.now());
  return { userId, interval, returnTo: safeReturnPath(meta.returnTo), ...(await grantPro(userId, tx, paidAt, interval)) };
}

/** Paystack signs webhooks with HMAC-SHA512 of the raw body using the secret key. */
export function validWebhookSignature(rawBody: string, signature: string | null) {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key || !signature) return false;
  const expected = createHmac("sha512", key).update(rawBody).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

interface WebhookEvent {
  event: string;
  data: {
    reference?: string;
    subscription_code?: string;
    customer?: { customer_code?: string; email?: string };
  };
}

async function userByCustomer(customerCode?: string, email?: string) {
  const ctx = await context();
  if (customerCode) {
    const user = await ctx.adapter.findOne<{ id: string }>({ model: "user", where: [{ field: "paystackCustomerCode", value: customerCode }] });
    if (user) return user.id;
  }
  if (email) {
    const found = await ctx.internalAdapter.findUserByEmail(email.toLowerCase());
    if (found) return found.user.id;
  }
  return null;
}

export async function handleWebhook(event: WebhookEvent) {
  switch (event.event) {
    case "charge.success": {
      // Re-verify with the API rather than trusting the payload alone.
      if (event.data.reference) await verifyAndGrant(event.data.reference);
      return;
    }
    case "subscription.create": {
      const userId = await userByCustomer(event.data.customer?.customer_code, event.data.customer?.email);
      if (userId && event.data.subscription_code) {
        const ctx = await context();
        await ctx.internalAdapter.updateUser(userId, { paystackSubscriptionCode: event.data.subscription_code, proRenews: true });
      }
      return;
    }
    case "subscription.not_renew":
    case "subscription.disable": {
      // Pro stays active until the end of the paid period; it just won't renew.
      const userId = await userByCustomer(event.data.customer?.customer_code, event.data.customer?.email);
      if (userId) {
        const ctx = await context();
        await ctx.internalAdapter.updateUser(userId, { proRenews: false });
      }
      return;
    }
    default:
      return;
  }
}

/** Paystack-hosted page where a subscriber can update their card or cancel. */
export async function subscriptionManageLink(userId: string): Promise<string | null> {
  const ctx = await context();
  const user = await ctx.adapter.findOne<{ paystackSubscriptionCode?: string | null }>({
    model: "user",
    where: [{ field: "id", value: userId }],
  });
  if (!user?.paystackSubscriptionCode) return null;
  const data = await paystack<{ link: string }>(`/subscription/${encodeURIComponent(user.paystackSubscriptionCode)}/manage/link`);
  return data.link;
}

export async function hasSubscription(userId: string) {
  const ctx = await context();
  const user = await ctx.adapter.findOne<{ paystackSubscriptionCode?: string | null }>({
    model: "user",
    where: [{ field: "id", value: userId }],
  });
  return Boolean(user?.paystackSubscriptionCode);
}
