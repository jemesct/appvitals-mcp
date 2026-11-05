import { describe, expect, it } from "vitest";
import { monthlyAmount, summariseMrr } from "../src/mrr.js";
import type { Subscription } from "../src/types.js";

const sub = (o: Partial<Subscription>): Subscription => ({ id: "x", provider: "paddle", status: "active", normalisedStatus: "active", customer: null, product: null, amountMinor: 1200, currency: "AUD", interval: "month", intervalCount: 1, createdAt: "", cancelledAt: null, endsAt: null, ...o });

describe("MRR maths", () => {
  it("normalises intervals to a month", () => {
    expect(monthlyAmount(1200, "month", 1)).toBe(1200);
    expect(monthlyAmount(1200, "month", 3)).toBe(400);
    expect(monthlyAmount(12000, "year", 1)).toBe(1000);
    expect(monthlyAmount(24000, "year", 2)).toBe(1000);
    expect(monthlyAmount(1200, "week", 1)).toBe(5200);
    expect(monthlyAmount(1200, "day", 1)).toBe(36500);
    expect(monthlyAmount(1200, "month", 0)).toBe(1200);
  });
  it("keeps currencies apart and excludes inactive and trials", () => {
    const s = summariseMrr([
      sub({}), sub({ currency: "USD", amountMinor: 12000, interval: "year" }),
      sub({ normalisedStatus: "past_due" }), sub({ normalisedStatus: "trialing" }), sub({ normalisedStatus: "cancelled" }),
    ]);
    expect(s.byCurrency.AUD).toMatchObject({ mrrMinor: 2400, mrr: "24.00", arr: "288.00", subscriptions: 2 });
    expect(s.byCurrency.USD.mrrMinor).toBe(1000);
    expect(s.counts).toMatchObject({ active: 2, past_due: 1, trialing: 1, cancelled: 1 });
  });
  it("can include trials", () => {
    expect(summariseMrr([sub({ normalisedStatus: "trialing" })], true).byCurrency.AUD.mrrMinor).toBe(1200);
  });
  it("rounds to whole cents", () => {
    expect(summariseMrr([sub({ amountMinor: 1000, interval: "year" })]).byCurrency.AUD.mrrMinor).toBe(83);
  });
});
