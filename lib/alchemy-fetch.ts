type RetryOptions = {
  retries?: number;
  baseDelayMs?: number;
  jitterMs?: number;
  fetchImpl?: typeof fetch;
  sleepImpl?: (ms: number) => Promise<void>;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jitter(maxJitterMs: number): number {
  if (maxJitterMs <= 0) return 0;
  return Math.floor(Math.random() * (maxJitterMs + 1));
}

export function isAlchemyRetriableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

export async function fetchWithAlchemyRetry(
  input: string | URL | globalThis.Request,
  init?: RequestInit,
  options?: RetryOptions,
): Promise<Response> {
  const retries = Math.max(0, options?.retries ?? 4);
  const baseDelayMs = Math.max(0, options?.baseDelayMs ?? 400);
  const jitterMs = Math.max(0, options?.jitterMs ?? 150);
  const fetchImpl = options?.fetchImpl ?? fetch;
  const sleepImpl = options?.sleepImpl ?? sleep;

  let lastResponse: Response | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetchImpl(input, init);
    if (!isAlchemyRetriableStatus(res.status) || attempt === retries) {
      return res;
    }
    lastResponse = res;
    const delay = baseDelayMs * 2 ** attempt + jitter(jitterMs);
    await sleepImpl(delay);
  }

  if (lastResponse) return lastResponse;
  throw new Error("alchemy_fetch_unreachable");
}
