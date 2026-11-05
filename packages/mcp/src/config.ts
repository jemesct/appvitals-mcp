export interface RuntimeConfig {
  mock: boolean;
  packages: string[];
  allowWrites: boolean;
  http: boolean;
  port: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env, argv: string[] = []): RuntimeConfig {
  const packages = (env.APPVITALS_PACKAGES ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  const mock = env.APPVITALS_MOCK === "1" || env.APPVITALS_MOCK === "true";
  let http = false;
  let port = 3333;
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
    throw new Error(`Invalid --port value. Expected an integer from 1 to 65535.`);
  }
  return {
    mock,
    packages: packages.length > 0 ? packages : mock ? ["com.example.app"] : [],
    allowWrites: env.APPVITALS_ALLOW_WRITES === "true" || env.APPVITALS_ALLOW_WRITES === "1",
    http,
    port,
  };
}
