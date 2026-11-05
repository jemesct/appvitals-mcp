import { createPlayClientFromEnv, type PlayClient } from "appvitals-mcp";
import { emailSenderFromEnv, type EmailSender } from "./email";
import { MemoryRepository } from "./memory-repo";
import type { Repository } from "./repo";

const globalStore = globalThis as typeof globalThis & {
  __hostedmcpRepo?: Repository;
  __hostedmcpEmail?: EmailSender;
};

export function getMemoryRepo(): MemoryRepository {
  if (!globalStore.__hostedmcpRepo || !(globalStore.__hostedmcpRepo instanceof MemoryRepository)) {
    globalStore.__hostedmcpRepo = new MemoryRepository();
  }
  return globalStore.__hostedmcpRepo as MemoryRepository;
}

export async function getRepo(): Promise<Repository> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return getMemoryRepo();
  if (globalStore.__hostedmcpRepo && !(globalStore.__hostedmcpRepo instanceof MemoryRepository)) {
    return globalStore.__hostedmcpRepo;
  }
  const { createPostgresRepository } = await import("./postgres-repo");
  globalStore.__hostedmcpRepo = createPostgresRepository(databaseUrl);
  return globalStore.__hostedmcpRepo;
}

export function getEmail(): EmailSender {
  if (!globalStore.__hostedmcpEmail) {
    globalStore.__hostedmcpEmail = emailSenderFromEnv();
  }
  return globalStore.__hostedmcpEmail;
}

export function getPlayClient(): PlayClient {
  return createPlayClientFromEnv(process.env);
}

export function cronAuthorised(header: string | null, secret: string | undefined): boolean {
  if (!secret || !header) return false;
  const expected = `Bearer ${secret}`;
  if (header.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < header.length; i++) {
    mismatch |= header.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return mismatch === 0;
}
