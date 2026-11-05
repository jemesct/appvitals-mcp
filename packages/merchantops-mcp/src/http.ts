export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function requestJson(fetchFn: FetchLike, url: string, init: RequestInit): Promise<any> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const res = await fetchFn(url, init);
  const text = await res.text();
  if (!res.ok) {
    throw new ApiError(res.status, `HTTP ${res.status} from ${new URL(url).pathname}: ${text.slice(0, 300)}`);
  }
  return text ? JSON.parse(text) : {};
}
