/* Realistic but fake fixture data shaped like the real API responses. */
const ls = (type: string, id: string, attributes: Record<string, unknown>) => ({ type, id, attributes });

export const lsSubscriptions = [
  ls("subscriptions", "1001", { status: "active", user_email: "ava@example.com", product_name: "Pixel Pal", variant_name: "Pro monthly", created_at: "2026-03-02T01:00:00Z", cancelled: false, ends_at: null, first_subscription_item: { price_id: 501, quantity: 1 } }),
  ls("subscriptions", "1002", { status: "active", user_email: "noah@example.com", product_name: "Pixel Pal", variant_name: "Pro yearly", created_at: "2026-01-15T01:00:00Z", cancelled: false, ends_at: null, first_subscription_item: { price_id: 502, quantity: 1 } }),
  ls("subscriptions", "1003", { status: "on_trial", user_email: "mia@example.com", product_name: "Pixel Pal", variant_name: "Pro monthly", created_at: "2026-10-30T01:00:00Z", cancelled: false, ends_at: null, first_subscription_item: { price_id: 501, quantity: 1 } }),
  ls("subscriptions", "1004", { status: "past_due", user_email: "liam@example.com", product_name: "Pixel Pal", variant_name: "Team monthly", created_at: "2026-05-01T01:00:00Z", updated_at: "2026-11-01T02:00:00Z", cancelled: false, ends_at: null, first_subscription_item: { price_id: 501, quantity: 3 } }),
  ls("subscriptions", "1005", { status: "cancelled", user_email: "zoe@example.com", product_name: "Pixel Pal", variant_name: "Pro monthly", created_at: "2026-02-01T01:00:00Z", updated_at: "2026-10-20T03:00:00Z", cancelled: true, ends_at: "2026-11-20T03:00:00Z", first_subscription_item: { price_id: 501, quantity: 1 } }),
  ls("subscriptions", "1006", { status: "expired", user_email: "oli@example.com", product_name: "Pixel Pal", variant_name: "Pro monthly", created_at: "2025-12-01T01:00:00Z", updated_at: "2026-09-01T03:00:00Z", cancelled: true, ends_at: "2026-09-01T03:00:00Z", first_subscription_item: { price_id: 501, quantity: 1 } }),
];
export const lsPrices: Record<string, unknown> = {
  "501": ls("prices", "501", { unit_price: 1900, currency: "AUD", renewal_interval_unit: "month", renewal_interval_quantity: 1 }),
  "502": ls("prices", "502", { unit_price: 18000, currency: "AUD", renewal_interval_unit: "year", renewal_interval_quantity: 1 }),
};
export const lsOrders = [
  ls("orders", "2001", { status: "paid", user_email: "ava@example.com", total: 1900, currency: "AUD", refunded: false, refunded_amount: 0, refunded_at: null, created_at: "2026-10-02T01:00:00Z" }),
  ls("orders", "2002", { status: "refunded", user_email: "zoe@example.com", total: 1900, currency: "AUD", refunded: true, refunded_amount: 1900, refunded_at: "2026-10-21T01:00:00Z", created_at: "2026-10-01T01:00:00Z" }),
  ls("orders", "2003", { status: "partial_refund", user_email: "noah@example.com", total: 18000, currency: "AUD", refunded: false, refunded_amount: 5000, refunded_at: "2026-09-10T01:00:00Z", created_at: "2026-01-15T01:00:00Z" }),
  ls("orders", "2004", { status: "failed", user_email: "liam@example.com", total: 5700, currency: "AUD", refunded: false, refunded_amount: 0, refunded_at: null, created_at: "2026-11-01T02:00:00Z" }),
];
export const lsLicenseKeys = [
  ls("license-keys", "3001", { key_short: "XXXX-7A1C", status: "active", user_email: "ava@example.com", activation_usage: 1, activation_limit: 3, expires_at: null }),
  ls("license-keys", "3002", { key_short: "XXXX-91BE", status: "inactive", user_email: "mia@example.com", activation_usage: 0, activation_limit: 3, expires_at: null }),
  ls("license-keys", "3003", { key_short: "XXXX-C0DE", status: "disabled", user_email: "zoe@example.com", activation_usage: 2, activation_limit: 2, expires_at: "2026-11-20T03:00:00Z" }),
];
export const lsDiscounts = [
  ls("discounts", "4001", { name: "Launch week", code: "LAUNCH20", amount: 20, amount_type: "percent", status: "published" }),
  ls("discounts", "4002", { name: "Five off", code: "FIVEOFF", amount: 500, amount_type: "fixed", status: "draft" }),
];

const price = (amount: string, interval: string, frequency: number, description: string) => ({ unit_price: { amount, currency_code: "USD" }, billing_cycle: { interval, frequency }, description });
export const paddleSubscriptions = [
  { id: "sub_01aaaaaaaaaaaaaaaaaaaaaaaa", status: "active", customer_id: "ctm_01aaa", currency_code: "USD", billing_cycle: { interval: "month", frequency: 1 }, items: [{ quantity: 2, price: price("2900", "month", 1, "Shipkit Pro seat") }], created_at: "2026-04-01T00:00:00Z", canceled_at: null },
  { id: "sub_01bbbbbbbbbbbbbbbbbbbbbbbb", status: "active", customer_id: "ctm_01bbb", currency_code: "USD", billing_cycle: { interval: "year", frequency: 1 }, items: [{ quantity: 1, price: price("29000", "year", 1, "Shipkit Pro yearly") }], created_at: "2026-02-01T00:00:00Z", canceled_at: null },
  { id: "sub_01cccccccccccccccccccccccc", status: "trialing", customer_id: "ctm_01ccc", currency_code: "USD", billing_cycle: { interval: "month", frequency: 1 }, items: [{ quantity: 1, price: price("2900", "month", 1, "Shipkit Pro seat") }], created_at: "2026-11-01T00:00:00Z", canceled_at: null },
  { id: "sub_01dddddddddddddddddddddddd", status: "past_due", customer_id: "ctm_01ddd", currency_code: "USD", billing_cycle: { interval: "month", frequency: 3 }, items: [{ quantity: 1, price: price("7500", "month", 3, "Shipkit quarterly") }], created_at: "2026-06-01T00:00:00Z", updated_at: "2026-11-02T00:00:00Z", canceled_at: null },
  { id: "sub_01eeeeeeeeeeeeeeeeeeeeeeee", status: "canceled", customer_id: "ctm_01eee", currency_code: "USD", billing_cycle: { interval: "month", frequency: 1 }, items: [{ quantity: 1, price: price("2900", "month", 1, "Shipkit Pro seat") }], created_at: "2026-03-01T00:00:00Z", canceled_at: "2026-10-28T00:00:00Z" },
];
export const paddleTransactions = [
  { id: "txn_01ffffffffffffffffffffffff", status: "past_due", customer_id: "ctm_01ddd", currency_code: "USD", details: { totals: { grand_total: "7500" } }, billed_at: "2026-11-02T00:00:00Z", created_at: "2026-11-02T00:00:00Z" },
];
export const paddleAdjustments = [
  { id: "adj_01gggggggggggggggggggggggg", action: "refund", transaction_id: "txn_01hhhhhhhhhhhhhhhhhhhhhhhh", status: "approved", currency_code: "USD", totals: { total: "2900" }, created_at: "2026-10-28T00:00:00Z" },
  { id: "adj_01iiiiiiiiiiiiiiiiiiiiiiii", action: "refund", transaction_id: "txn_01jjjjjjjjjjjjjjjjjjjjjjjj", status: "pending_approval", currency_code: "USD", totals: { total: "1000" }, created_at: "2026-11-03T00:00:00Z" },
];
export const paddleDiscounts = [
  { id: "dsc_01kkkkkkkkkkkkkkkkkkkkkkkk", status: "active", description: "Black Friday", code: "BF30", type: "percentage", amount: "30", currency_code: null },
  { id: "dsc_01llllllllllllllllllllllll", status: "archived", description: "Ten dollars off", code: "TENOFF", type: "flat", amount: "1000", currency_code: "USD" },
];
