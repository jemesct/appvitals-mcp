export type ProviderName = "lemonsqueezy" | "paddle";
export type Interval = "day" | "week" | "month" | "year";

/** Normalised subscription. Amounts are integers in minor units (cents). */
export interface Subscription {
  id: string;
  provider: ProviderName;
  status: string; // provider's own status string
  normalisedStatus: "active" | "trialing" | "past_due" | "paused" | "cancelled" | "expired" | "other";
  customer: string | null;
  product: string | null;
  amountMinor: number; // per billing period, all items x quantity
  currency: string;
  interval: Interval;
  intervalCount: number;
  createdAt: string;
  cancelledAt: string | null;
  endsAt: string | null;
}

export interface FailedPayment {
  id: string;
  kind: "subscription" | "order" | "transaction";
  status: string;
  customer: string | null;
  amountMinor: number | null;
  currency: string | null;
  at: string | null;
}

export interface Refund {
  id: string;
  orderOrTransactionId: string;
  status: string;
  amountMinor: number;
  currency: string;
  at: string | null;
}

export interface LicenseKey {
  id: string;
  keyShort: string;
  status: string;
  customer: string | null;
  activationUsage: number;
  activationLimit: number | null;
  expiresAt: string | null;
}

export interface Discount {
  id: string;
  code: string | null;
  name: string;
  status: string;
  amountType: "percent" | "fixed";
  amount: number; // percent value or minor units
  currency: string | null;
}

export interface DiscountInput {
  name: string;
  code: string;
  amountType: "percent" | "fixed";
  amount: number;
  currency?: string;
}

export interface WriteRequest {
  method: "POST" | "PATCH";
  path: string;
  body: unknown;
}

export interface Provider {
  name: ProviderName;
  capabilities: Record<string, boolean | string>;
  listSubscriptions(): Promise<Subscription[]>;
  failedPayments(): Promise<FailedPayment[]>;
  refunds(): Promise<Refund[]>;
  listLicenseKeys?(): Promise<LicenseKey[]>;
  listDiscounts(): Promise<Discount[]>;
  planRevokeLicenseKey?(id: string): WriteRequest;
  planCreateDiscount(input: DiscountInput): WriteRequest;
  planRefund(id: string, amountMinor?: number, reason?: string): WriteRequest;
  execute(req: WriteRequest): Promise<unknown>;
}

export class UnsupportedError extends Error {}
