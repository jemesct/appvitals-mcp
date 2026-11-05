import { readFileSync } from "node:fs";

export interface RuntimeConfig {
  mock: boolean;
  appIds: string[];
  allowWrites: boolean;
  http: boolean;
  port: number;
  issuerId: string | null;
  keyId: string | null;
  privateKey: string | null;
  vendorNumber: string | null;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env, argv: string[] = []): RuntimeConfig {
  const appIds = (env.SHIPVITALS_APP_IDS ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  const mock = env.SHIPVITALS_MOCK === "1" || env.SHIPVITALS_MOCK === "true";
  let http = false;
  let port = 3334;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? "";
    if (arg === "--http") {
      http = true;
      continue;
    }
    if (arg === "--port") {
      port = Number(argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg.startsWith("--port=")) {
      port = Number(arg.slice("--port=".length));
    }
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("Invalid --port value. Expected an integer from 1 to 65535.");
  }
  const issuerId = blankToNull(env.SHIPVITALS_ISSUER_ID);
  const keyId = blankToNull(env.SHIPVITALS_KEY_ID);
  const vendorNumber = blankToNull(env.SHIPVITALS_VENDOR_NUMBER);
  return {
    mock,
    appIds: appIds.length > 0 ? appIds : mock ? ["1234567890"] : [],
    allowWrites: env.SHIPVITALS_ALLOW_WRITES === "true" || env.SHIPVITALS_ALLOW_WRITES === "1",
    http,
    port,
    issuerId,
    keyId,
    privateKey: readPrivateKey(env),
    vendorNumber,
  };
}

export function readPrivateKey(env: NodeJS.ProcessEnv): string | null {
  const inline = env.SHIPVITALS_PRIVATE_KEY?.trim();
  if (inline) {
    return inline.includes("\\n") ? inline.replace(/\\n/g, "\n") : inline;
  }
  const filePath = env.SHIPVITALS_PRIVATE_KEY_PATH?.trim();
  if (!filePath) return null;
  try {
    return readFileSync(filePath, "utf8");
  } catch {
    throw new Error(`Could not read SHIPVITALS_PRIVATE_KEY_PATH (${filePath}).`);
  }
}

function blankToNull(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
