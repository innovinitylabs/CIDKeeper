export const LOCAL_STORAGE_ALCHEMY_KEY = "cidkeeper_local_alchemy_api_key";
export const LOCAL_STORAGE_WEB3_TOKEN = "cidkeeper_local_web3storage_token";

/** Single JSON blob so Alchemy-only (or web3-only) saves do not depend on the other field. */
const PROVIDER_KEYS_JSON_KEY = "cidkeeper_provider_keys_v1";

export type LoadedProviderKeys = {
  alchemyApiKey: string;
  web3StorageToken: string;
};

export function loadProviderKeysFromBrowser(): LoadedProviderKeys {
  if (typeof window === "undefined") {
    return { alchemyApiKey: "", web3StorageToken: "" };
  }
  try {
    const raw = window.localStorage.getItem(PROVIDER_KEYS_JSON_KEY);
    if (raw) {
      const j = JSON.parse(raw) as Record<string, unknown>;
      return {
        alchemyApiKey: typeof j.alchemyApiKey === "string" ? j.alchemyApiKey : "",
        web3StorageToken: typeof j.web3StorageToken === "string" ? j.web3StorageToken : "",
      };
    }
  } catch {
    // fall through to legacy keys
  }
  try {
    return {
      alchemyApiKey: window.localStorage.getItem(LOCAL_STORAGE_ALCHEMY_KEY) ?? "",
      web3StorageToken: window.localStorage.getItem(LOCAL_STORAGE_WEB3_TOKEN) ?? "",
    };
  } catch {
    return { alchemyApiKey: "", web3StorageToken: "" };
  }
}

export function saveProviderKeysToBrowser(alchemyApiKey: string, web3StorageToken: string): void {
  if (typeof window === "undefined") return;
  const a = alchemyApiKey.trim();
  const w = web3StorageToken.trim();
  const payload: Record<string, string> = {};
  if (a) payload.alchemyApiKey = a;
  if (w) payload.web3StorageToken = w;
  try {
    if (Object.keys(payload).length === 0) {
      window.localStorage.removeItem(PROVIDER_KEYS_JSON_KEY);
    } else {
      window.localStorage.setItem(PROVIDER_KEYS_JSON_KEY, JSON.stringify(payload));
    }
    window.localStorage.removeItem(LOCAL_STORAGE_ALCHEMY_KEY);
    window.localStorage.removeItem(LOCAL_STORAGE_WEB3_TOKEN);
  } catch (e) {
    throw e instanceof Error ? e : new Error("local_storage_write_failed");
  }
}

export function clearProviderKeysFromBrowser(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(PROVIDER_KEYS_JSON_KEY);
    window.localStorage.removeItem(LOCAL_STORAGE_ALCHEMY_KEY);
    window.localStorage.removeItem(LOCAL_STORAGE_WEB3_TOKEN);
  } catch {
    // ignore
  }
}

export const HEADER_ALCHEMY_API_KEY = "x-cidkeeper-alchemy-api-key";
export const HEADER_WEB3_STORAGE_TOKEN = "x-cidkeeper-web3storage-token";

export function alchemyApiKeyFromRequest(req: Request): string | null {
  const fromHeader = req.headers.get(HEADER_ALCHEMY_API_KEY)?.trim();
  if (fromHeader) return fromHeader;
  const env = process.env.ALCHEMY_API_KEY?.trim();
  return env || null;
}

export function web3StorageTokenFromRequest(req: Request): string | null {
  const fromHeader = req.headers.get(HEADER_WEB3_STORAGE_TOKEN)?.trim();
  if (fromHeader) return fromHeader;
  const env = process.env.WEB3STORAGE_TOKEN?.trim();
  return env || null;
}
