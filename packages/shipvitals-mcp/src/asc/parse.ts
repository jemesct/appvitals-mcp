import type { CustomerReview, FinanceSummary, SalesSummary } from "./types.js";

export interface JsonApiResource {
  id?: string;
  type?: string;
  attributes?: Record<string, unknown>;
  relationships?: Record<string, { data?: { id?: string; type?: string } | null }>;
}

export interface JsonApiDocument {
  data?: JsonApiResource | JsonApiResource[];
  links?: { next?: string };
  errors?: Array<{ title?: string; detail?: string; code?: string }>;
}

export function asDocument(body: unknown): JsonApiDocument {
  if (!body || typeof body !== "object") return {};
  return body as JsonApiDocument;
}

export function resourceList(body: unknown): JsonApiResource[] {
  const data = asDocument(body).data;
  if (!data) return [];
  return Array.isArray(data) ? data : [data];
}

export function stringAttr(resource: JsonApiResource, name: string): string | null {
  const value = resource.attributes?.[name];
  return typeof value === "string" && value.trim() ? value : null;
}

export function numberAttr(resource: JsonApiResource, name: string): number | null {
  const value = resource.attributes?.[name];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function booleanAttr(resource: JsonApiResource, name: string): boolean | null {
  const value = resource.attributes?.[name];
  return typeof value === "boolean" ? value : null;
}

export function parseReviews(body: unknown): { reviews: CustomerReview[]; next: string | null } {
  const doc = asDocument(body);
  const reviews = resourceList(body).map((resource) => {
    const response = resource.relationships?.response?.data;
    return {
      id: resource.id ?? "",
      rating: numberAttr(resource, "rating") ?? 0,
      title: stringAttr(resource, "title"),
      body: stringAttr(resource, "body"),
      reviewerNickname: stringAttr(resource, "reviewerNickname"),
      createdDate: stringAttr(resource, "createdDate"),
      territory: stringAttr(resource, "territory"),
      hasResponse: Boolean(response && response.id),
    };
  });
  return { reviews: reviews.filter((review) => review.id), next: doc.links?.next ?? null };
}

export interface TsvTable {
  headers: string[];
  rows: string[][];
  truncated: boolean;
}

const MAX_TSV_ROWS = 100_000;

export function parseTsv(text: string): TsvTable {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [], truncated: false };
  const headers = (lines[0] ?? "").split("\t").map((header) => header.trim());
  const data = lines.slice(1);
  const truncated = data.length > MAX_TSV_ROWS;
  const rows = data.slice(0, MAX_TSV_ROWS).map((line) => line.split("\t"));
  return { headers, rows, truncated };
}

function column(headers: string[], name: string): number {
  return headers.findIndex((header) => header.toLowerCase() === name.toLowerCase());
}

function cell(row: string[], index: number): string {
  if (index < 0) return "";
  return (row[index] ?? "").trim();
}

function parseAmount(raw: string): number | null {
  if (!raw) return null;
  const normalised = raw.replace(/,/g, "");
  const value = Number(normalised);
  return Number.isFinite(value) ? value : null;
}

export function summariseSalesTsv(
  text: string,
  input: { vendorNumber: string; frequency: string; reportDate: string; reportType: string; sku?: string },
): SalesSummary {
  const table = parseTsv(text);
  const unitsIdx = column(table.headers, "Units");
  const proceedsIdx = column(table.headers, "Developer Proceeds");
  const skuIdx = column(table.headers, "SKU");
  const titleIdx = column(table.headers, "Title");
  const currencyIdx = column(table.headers, "Currency of Proceeds");
  if (unitsIdx < 0) {
    throw new Error("The sales report did not include a Units column, so it was not summarised.");
  }
  const wantedSku = input.sku?.trim();
  const bySku = new Map<string, { sku: string; title: string | null; units: number; proceeds: number }>();
  let units = 0;
  let proceeds = 0;
  let sawProceeds = false;
  const currencies = new Set<string>();
  let rowCount = 0;
  for (const row of table.rows) {
    const sku = cell(row, skuIdx) || "(no sku)";
    if (wantedSku && sku !== wantedSku) continue;
    const rowUnits = parseAmount(cell(row, unitsIdx)) ?? 0;
    const rowProceeds = parseAmount(cell(row, proceedsIdx));
    const title = cell(row, titleIdx) || null;
    const rowCurrency = cell(row, currencyIdx);
    if (rowCurrency) currencies.add(rowCurrency);
    units += rowUnits;
    if (rowProceeds != null) {
      proceeds += rowProceeds;
      sawProceeds = true;
    }
    const current = bySku.get(sku) ?? { sku, title, units: 0, proceeds: 0 };
    current.units += rowUnits;
    if (rowProceeds != null) current.proceeds += rowProceeds;
    if (!current.title && title) current.title = title;
    bySku.set(sku, current);
    rowCount += 1;
  }
  const mixed = currencies.size > 1;
  const ranked = [...bySku.values()].sort((a, b) => b.units - a.units || a.sku.localeCompare(b.sku));
  return {
    vendorNumber: input.vendorNumber,
    frequency: input.frequency,
    reportDate: input.reportDate,
    reportType: input.reportType,
    reportSubType: "SUMMARY",
    rowCount,
    truncated: table.truncated || ranked.length > 25,
    currency: currencies.size === 1 ? [...currencies][0] ?? null : null,
    currencyNote: mixed ? "The report contains more than one proceeds currency, so proceeds were not totalled." : null,
    totals: {
      units,
      developerProceeds: sawProceeds && !mixed ? roundMoney(proceeds) : null,
    },
    bySku: ranked.slice(0, 25).map((row) => ({
      sku: row.sku,
      title: row.title,
      units: row.units,
      proceeds: sawProceeds && !mixed ? roundMoney(row.proceeds) : null,
    })),
  };
}

export function summariseFinanceTsv(
  text: string,
  input: { vendorNumber: string; regionCode: string; reportDate: string },
): FinanceSummary {
  const table = parseTsv(text);
  const quantityIdx = column(table.headers, "Quantity");
  const shareIdx = column(table.headers, "Extended Partner Share");
  const currencyIdx = column(table.headers, "Partner Share Currency");
  if (quantityIdx < 0 && shareIdx < 0) {
    throw new Error(
      "The finance report did not include Quantity or Extended Partner Share, so it was not summarised.",
    );
  }
  let quantity = 0;
  let share = 0;
  let sawShare = false;
  const currencies = new Set<string>();
  for (const row of table.rows) {
    quantity += parseAmount(cell(row, quantityIdx)) ?? 0;
    const rowShare = parseAmount(cell(row, shareIdx));
    if (rowShare != null) {
      share += rowShare;
      sawShare = true;
    }
    const rowCurrency = cell(row, currencyIdx);
    if (rowCurrency) currencies.add(rowCurrency);
  }
  const mixed = currencies.size > 1;
  return {
    vendorNumber: input.vendorNumber,
    regionCode: input.regionCode,
    reportDate: input.reportDate,
    rowCount: table.rows.length,
    truncated: table.truncated,
    currency: currencies.size === 1 ? [...currencies][0] ?? null : null,
    currencyNote: mixed ? "The report contains more than one partner-share currency, so the share was not totalled." : null,
    totals: {
      quantity,
      extendedPartnerShare: sawShare && !mixed ? roundMoney(share) : null,
    },
  };
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
