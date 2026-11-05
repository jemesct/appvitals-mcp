export type PlanId = "solo" | "unlimited";
export type AlertFrequency = "daily" | "weekly";
export type SubscriptionStatus = "trialing" | "active" | "cancelled" | "expired" | "past_due";

export interface ProductPlan {
  id: PlanId;
  name: string;
  priceUsdMonthly: number;
  /** null means no cap. */
  appLimit: number | null;
  blurb: string;
}

export interface ProductDefinition {
  id: string;
  name: string;
  path: string;
  connectPath: string;
  mcpPath: string;
  summary: string;
  trialDays: number;
  plans: ProductPlan[];
}

export const products: ProductDefinition[] = [
  {
    id: "appvitals",
    name: "AppVitals",
    path: "/appvitals",
    connectPath: "/appvitals/connect",
    mcpPath: "/api/mcp/appvitals",
    summary: "Play reviews, crash and ANR rates, and releases for Android apps.",
    trialDays: 7,
    plans: [
      {
        id: "solo",
        name: "One app",
        priceUsdMonthly: 9,
        appLimit: 1,
        blurb: "Hosted MCP URL and API key for one Android app, daily review history, and crash and ANR alerts.",
      },
      {
        id: "unlimited",
        name: "Unlimited apps",
        priceUsdMonthly: 19,
        appLimit: null,
        blurb: "Everything in One app, for every app on your developer account.",
      },
    ],
  },
];

export function getProduct(id: string): ProductDefinition | undefined {
  return products.find((product) => product.id === id);
}

export function isPlanId(value: string): value is PlanId {
  return value === "solo" || value === "unlimited";
}

export function planFor(productId: string, planId: PlanId): ProductPlan | undefined {
  return getProduct(productId)?.plans.find((plan) => plan.id === planId);
}

export function appLimitFor(productId: string, planId: PlanId): number | null {
  const plan = planFor(productId, planId);
  return plan ? plan.appLimit : 0;
}
