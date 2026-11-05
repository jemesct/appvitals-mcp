import { describe, expect, it } from "vitest";
import { parseDailyFreshness, timelineSpec } from "../src/play/parse.js";

describe("timelineSpec", () => {
  it("uses LA timezone and freshness end date", () => {
    const end = parseDailyFreshness({ freshnessInfo: { freshnesses: [{ aggregationPeriod: "DAILY", latestEndTime: { year: 2026, month: 11, day: 4 } }] } });
    const spec = timelineSpec(7, new Date("2026-11-05T00:00:00Z"), end);
    expect(spec.endTime).toMatchObject({ year: 2026, month: 11, day: 4, timeZone: { id: "America/Los_Angeles" } });
    expect(spec.startTime).toMatchObject({ month: 10, day: 28 });
  });
  it("falls back to a safe past date without freshness", () => {
    const spec = timelineSpec(7, new Date("2026-11-05T00:00:00Z"));
    expect(spec.endTime).toMatchObject({ month: 11, day: 3 });
  });
});
