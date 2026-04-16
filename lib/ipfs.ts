import type { HealthStatus } from "@/types/nft";

export const IPFS_GATEWAYS = [
  "https://ipfs.io/ipfs/",
  "https://cloudflare-ipfs.com/ipfs/",
  "https://dweb.link/ipfs/",
] as const;

const ATTEMPTS_PER_GATEWAY = 3;
const HEALTH_TIMEOUT_MS = 12_000;
const DOWNLOAD_TIMEOUT_MS = 120_000;
const SLOW_MS = 2000;

export function createConcurrencyLimiter(max: number) {
  let active = 0;
  const queue: Array<() => void> = [];

  const next = () => {
    active--;
    const fn = queue.shift();
    if (fn) fn();
  };

  return async function limit<T>(task: () => Promise<T>): Promise<T> {
    if (active >= max) {
      await new Promise<void>((resolve) => queue.push(resolve));
    }
    active++;
    try {
      return await task();
    } finally {
      next();
    }
  };
}

export const limitConcurrency5 = createConcurrencyLimiter(5);

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function abortBody(res: Response) {
  try {
    await res.body?.cancel();
  } catch {
    // ignore
  }
}

export type HealthResult = {
  status: HealthStatus;
  ms: number | null;
  gateway: string | null;
};

export async function checkCIDHealth(cid: string): Promise<HealthResult> {
  let last: HealthResult = { status: "dead", ms: null, gateway: null };

  for (const base of IPFS_GATEWAYS) {
    const url = `${base}${cid}`;
    const started = Date.now();
    try {
      const res = await fetch(url, {
        method: "GET",
        redirect: "follow",
        signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
      });
      const ms = Date.now() - started;
      await abortBody(res);
      if (!res.ok) {
        last = { status: "dead", ms, gateway: base };
        continue;
      }
      const status: HealthStatus = ms > SLOW_MS ? "slow" : "alive";
      return { status, ms, gateway: base };
    } catch {
      last = { status: "dead", ms: Date.now() - started, gateway: base };
    }
  }

  return last;
}

export function extensionFromContentType(contentType: string | null): string {
  if (!contentType) return ".bin";
  const ct = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
  const map: Record<string, string> = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "image/svg+xml": ".svg",
    "application/json": ".json",
    "text/json": ".json",
    "text/plain": ".txt",
    "video/mp4": ".mp4",
    "video/webm": ".webm",
    "audio/mpeg": ".mp3",
    "audio/wav": ".wav",
    "application/octet-stream": ".bin",
  };
  return map[ct] ?? ".bin";
}

export type DownloadResult =
  | {
      ok: true;
      bytes: Uint8Array;
      contentType: string | null;
      gateway: string;
    }
  | { ok: false; error: string };

/**
 * Fetches exact bytes from IPFS without decoding or transforming the payload.
 * Retries each gateway up to ATTEMPTS_PER_GATEWAY times on transient failures.
 */
export async function downloadExactBytes(cid: string): Promise<DownloadResult> {
  let lastErr = "all_gateways_failed";

  for (const base of IPFS_GATEWAYS) {
    const url = `${base}${cid}`;
    for (let attempt = 0; attempt < ATTEMPTS_PER_GATEWAY; attempt++) {
      try {
        const res = await fetch(url, {
          method: "GET",
          redirect: "follow",
          signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
        });
        if (!res.ok) {
          lastErr = `http_${res.status}`;
          await abortBody(res);
          await sleep(150 * (attempt + 1));
          continue;
        }
        // Preserve exact gateway bytes (no text decoding or image transforms).
        const buf = new Uint8Array(await res.arrayBuffer());
        const contentType = res.headers.get("content-type");
        return { ok: true, bytes: buf, contentType, gateway: base };
      } catch (e) {
        lastErr = e instanceof Error ? e.message : "fetch_error";
        await sleep(200 * (attempt + 1));
      }
    }
  }

  return { ok: false, error: lastErr };
}
