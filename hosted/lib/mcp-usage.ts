import type { Repository } from "./repo";

const TOOL_NAME = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;

interface JsonRpcMessage {
  method?: unknown;
  params?: { name?: unknown };
  error?: unknown;
  result?: { isError?: unknown };
}

/** Tool names from a hosted MCP request. Arguments are discarded. */
export function toolNamesFromMcpBody(raw: string): string[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return [];
  }
  const messages = Array.isArray(parsed) ? parsed : [parsed];
  const names: string[] = [];
  for (const message of messages) {
    const name = toolName(message);
    if (name) names.push(name);
  }
  return names;
}

function toolName(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const message = value as JsonRpcMessage;
  if (message.method !== "tools/call") return null;
  const name = message.params?.name;
  if (typeof name !== "string" || !TOOL_NAME.test(name)) return null;
  return name;
}

export async function toolCallOk(response: Response): Promise<boolean> {
  if (response.status >= 400) return false;
  let text = "";
  try {
    text = await response.text();
  } catch {
    return false;
  }
  if (!text) return true;
  try {
    return !messageFailed(JSON.parse(text) as unknown);
  } catch {
    return true;
  }
}

function messageFailed(value: unknown): boolean {
  if (Array.isArray(value)) return value.some((item) => messageFailed(item));
  if (!value || typeof value !== "object") return false;
  const message = value as JsonRpcMessage;
  if (message.error != null) return true;
  return message.result?.isError === true;
}

/**
 * Writes one mcp_usage row per tools/call in this request.
 * A logging failure is swallowed so the MCP response still returns.
 */
export async function recordAuthenticatedToolCall(opts: {
  repo: Repository;
  productId: string;
  customerId: string;
  keyPrefix: string;
  body: string;
  response: Response | null;
  startedAt: number;
  failed: boolean;
}): Promise<void> {
  const names = toolNamesFromMcpBody(opts.body);
  if (names.length === 0) return;
  const latencyMs = Math.max(0, Date.now() - opts.startedAt);
  let ok = false;
  if (!opts.failed && opts.response) {
    try {
      ok = await toolCallOk(opts.response.clone());
    } catch {
      ok = false;
    }
  }
  const createdAt = new Date().toISOString();
  try {
    for (const toolName of names) {
      await opts.repo.recordToolEvent({
        productId: opts.productId,
        customerId: opts.customerId,
        keyPrefix: opts.keyPrefix,
        toolName,
        ok,
        latencyMs,
        createdAt,
      });
    }
  } catch {
    // The tool response must not depend on the usage insert.
  }
}

export function forwardMcpRequest(req: Request, body: string): Request {
  const headers = new Headers(req.headers);
  if (req.method === "GET" || req.method === "HEAD") {
    return new Request(req.url, { method: req.method, headers });
  }
  return new Request(req.url, { method: req.method, headers, body });
}
