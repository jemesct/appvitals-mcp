const APPLE_APP_ID = /^\d{6,20}$/;

export interface HostedShipVitalsOpen {
  open: true;
  mock: boolean;
  appIds: string[];
  /** Vendor-wide reports stay off on the shared-key route. */
  salesReports: false;
  /** Public replies stay off. Self-host to send them with your own key. */
  allowWrites: false;
}

export interface HostedShipVitalsClosed {
  open: false;
  message: string;
}

const CLOSED =
  "Hosted ShipVitals is not offered. Self-host the open source MCP with your own App Store Connect key. There is no public checkout.";

/**
 * Hosted ShipVitals is not a public multi-tenant product.
 *
 * The deployment .p8, when one is configured, is not something a customer can
 * point at an arbitrary Apple app id. This helper never reads customer apps.
 * `SHIPVITALS_APP_IDS` is the self-hosted CLI list and does not open the route.
 *
 * Follow-up, not implemented here: per-customer encrypted .p8. Each customer
 * would upload their own App Store Connect key, stored encrypted, and the MCP
 * would mint JWTs only for that customer. Do not build that on this shared key.
 */
export function resolveHostedShipVitals(env: NodeJS.ProcessEnv): HostedShipVitalsOpen | HostedShipVitalsClosed {
  const mock = env.SHIPVITALS_MOCK === "1" || env.SHIPVITALS_MOCK === "true";
  const allowed = parseAppIds(env.SHIPVITALS_ALLOWED_APP_IDS);
  if (!mock && allowed.length === 0) {
    return { open: false, message: CLOSED };
  }
  const appIds = allowed.length > 0 ? allowed : mockFallbackIds(env);
  if (appIds.length === 0) {
    return { open: false, message: CLOSED };
  }
  return { open: true, mock, appIds, salesReports: false, allowWrites: false };
}

function mockFallbackIds(env: NodeJS.ProcessEnv): string[] {
  const fromEnv = parseAppIds(env.SHIPVITALS_APP_IDS);
  return fromEnv.length > 0 ? fromEnv : ["1234567890"];
}

function parseAppIds(raw: string | undefined): string[] {
  const ids = (raw ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter((part) => APPLE_APP_ID.test(part));
  return [...new Set(ids)];
}
