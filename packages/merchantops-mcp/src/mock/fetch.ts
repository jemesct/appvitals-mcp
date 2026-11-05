import type { FetchLike } from "../http.js";
import * as f from "./fixtures.js";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** Fake fetch that serves fixtures for both providers. Records every call for tests. */
export function createMockFetch(calls: { method: string; url: string; body?: unknown }[] = []): FetchLike {
  return async (url, init) => {
    const u = new URL(url);
    const method = init?.method ?? "GET";
    calls.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const p = u.pathname;
    if (u.host === "api.lemonsqueezy.com") {
      if (method === "GET" && p === "/v1/subscriptions") {
        // Two pages to exercise pagination.
        const page = Number(u.searchParams.get("page[number]") ?? "1");
        const data = page === 1 ? f.lsSubscriptions.slice(0, 3) : f.lsSubscriptions.slice(3);
        const next = page === 1 ? `https://api.lemonsqueezy.com/v1/subscriptions?page[number]=2&page[size]=100` : null;
        return json({ data, links: { next }, meta: { page: { currentPage: page, lastPage: 2 } } });
      }
      const priceMatch = p.match(/^\/v1\/prices\/(\w+)$/);
      if (priceMatch) return f.lsPrices[priceMatch[1]] ? json({ data: f.lsPrices[priceMatch[1]] }) : json({ errors: [{ detail: "Not found" }] }, 404);
      if (method === "GET" && p === "/v1/orders") return json({ data: f.lsOrders, links: { next: null } });
      if (method === "GET" && p === "/v1/license-keys") return json({ data: f.lsLicenseKeys, links: { next: null } });
      if (method === "GET" && p === "/v1/discounts") return json({ data: f.lsDiscounts, links: { next: null } });
      if (method !== "GET") return json({ data: { mock: true, method, path: p } }, method === "POST" ? 201 : 200);
    }
    if (u.host === "sandbox-api.paddle.com" || u.host === "api.paddle.com") {
      const page = (data: unknown[]) => json({ data, meta: { pagination: { per_page: 200, has_more: false, next: null } } });
      const status = u.searchParams.get("status");
      if (method === "GET" && p === "/subscriptions") return page(status ? f.paddleSubscriptions.filter((s) => s.status === status) : f.paddleSubscriptions);
      if (method === "GET" && p === "/transactions") return page(status ? f.paddleTransactions.filter((t) => t.status === status) : f.paddleTransactions);
      if (method === "GET" && p === "/adjustments") return page(f.paddleAdjustments);
      if (method === "GET" && p === "/discounts") return page(f.paddleDiscounts);
      if (method === "POST") return json({ data: { mock: true, method, path: p } }, 201);
    }
    return json({ error: `mock has no route for ${method} ${u.host}${p}` }, 404);
  };
}
