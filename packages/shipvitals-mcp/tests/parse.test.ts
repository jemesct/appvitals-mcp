import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseReviews, summariseFinanceTsv, summariseSalesTsv } from "../src/asc/parse.js";

const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");

describe("asc parse", () => {
  it("parses a customer review page", () => {
    const body = JSON.parse(readFileSync(path.join(fixtures, "reviews.json"), "utf8")) as unknown;
    const page = parseReviews(body);
    expect(page.reviews[0]?.rating).toBe(2);
    expect(page.reviews[0]?.territory).toBe("AUS");
    expect(page.reviews[0]?.hasResponse).toBe(false);
    expect(page.next).toContain("cursor=2");
  });

  it("totals a sales report and refuses mixed proceeds currencies", () => {
    const text = readFileSync(path.join(fixtures, "sales.tsv"), "utf8");
    const summary = summariseSalesTsv(text, {
      vendorNumber: "80012345",
      frequency: "DAILY",
      reportDate: "2026-11-02",
      reportType: "SALES",
    });
    expect(summary.totals.units).toBe(16);
    expect(summary.totals.developerProceeds).toBe(13.1);
    expect(summary.currency).toBe("AUD");
    expect(summary.bySku[0]?.sku).toBe("example-ios");
    expect(summary.bySku[0]?.units).toBe(13);
    const filtered = summariseSalesTsv(text, {
      vendorNumber: "80012345",
      frequency: "DAILY",
      reportDate: "2026-11-02",
      reportType: "SALES",
      sku: "example-plus",
    });
    expect(filtered.rowCount).toBe(1);
    expect(filtered.totals.units).toBe(3);

    const mixed = summariseSalesTsv(`${text}other\tOther\t2\t9.00\tUSD\n`, {
      vendorNumber: "80012345",
      frequency: "DAILY",
      reportDate: "2026-11-02",
      reportType: "SALES",
    });
    expect(mixed.currency).toBeNull();
    expect(mixed.totals.developerProceeds).toBeNull();
    expect(mixed.totals.units).toBe(18);
    expect(mixed.currencyNote).toContain("not totalled");
  });

  it("totals a finance report", () => {
    const text = [
      "Quantity\tExtended Partner Share\tPartner Share Currency\tTitle",
      "10\t7.00\tAUD\tExample",
      "30\t21.50\tAUD\tExample",
    ].join("\n");
    const summary = summariseFinanceTsv(text, {
      vendorNumber: "80012345",
      regionCode: "AU",
      reportDate: "2026-10",
    });
    expect(summary.totals.quantity).toBe(40);
    expect(summary.totals.extendedPartnerShare).toBe(28.5);
    expect(summary.currency).toBe("AUD");
  });

  it("fails closed when the expected columns are missing", () => {
    expect(() =>
      summariseSalesTsv("Title\tSomething\nExample\t1\n", {
        vendorNumber: "1",
        frequency: "DAILY",
        reportDate: "2026-11-02",
        reportType: "SALES",
      }),
    ).toThrow(/Units/);
  });
});
