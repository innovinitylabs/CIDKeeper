export const LOCAL_STORAGE_ALCHEMY_KEY = "cidkeeper_local_alchemy_api_key";
/** Legacy key from web3.storage era; cleared so old tokens are not left behind. */
const LEGACY_LOCAL_STORAGE_WEB3_TOKEN = "cidkeeper_local_web3storage_token";

/** Single JSON blob for Alchemy key in the browser. */
const PROVIDER_KEYS_JSON_KEY = "cidkeeper_provider_keys_v1";

export type LoadedProviderKeys = {
  alchemyApiKey: string;
  /** 4EVERLAND Pinning service access token (Bearer) from the user dashboard. */
  fourEverlandToken: string;
};

export function loadProviderKeysFromBrowser(): LoadedProviderKeys {
  if (typeof window === "undefined") {
    return { alchemyApiKey: "", fourEverlandToken: "" };
  }
  try {
    const raw = window.localStorage.getItem(PROVIDER_KEYS_JSON_KEY);
    if (raw) {
      const j = JSON.parse(raw) as Record<string, unknown>;
      return {
        alchemyApiKey: typeof j.alchemyApiKey === "string" ? j.alchemyApiKey : "",
        fourEverlandToken: typeof j.fourEverlandToken === "string" ? j.fourEverlandToken : "",
      };
    }
  } catch {
    // fall through to legacy keys
  }
  try {
    return {
      alchemyApiKey: window.localStorage.getItem(LOCAL_STORAGE_ALCHEMY_KEY) ?? "",
      fourEverlandToken: "",
    };
  } catch {
    return { alchemyApiKey: "", fourEverlandToken: "" };
  }
}

export function saveProviderKeysToBrowser(alchemyApiKey: string, fourEverlandToken: string): void {
  if (typeof window === "undefined") return;
  const a = alchemyApiKey.trim();
  const f = fourEverlandToken.trim();
  const payload: Record<string, string> = {};
  if (a) payload.alchemyApiKey = a;
  if (f) payload.fourEverlandToken = f;
  try {
    if (Object.keys(payload).length === 0) {
      window.localStorage.removeItem(PROVIDER_KEYS_JSON_KEY);
    } else {
      window.localStorage.setItem(PROVIDER_KEYS_JSON_KEY, JSON.stringify(payload));
    }
    window.localStorage.removeItem(LOCAL_STORAGE_ALCHEMY_KEY);
  } catch (e) {
    throw e instanceof Error ? e : new Error("local_storage_write_failed");
  }
}

export function clearProviderKeysFromBrowser(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(PROVIDER_KEYS_JSON_KEY);
    window.localStorage.removeItem(LOCAL_STORAGE_ALCHEMY_KEY);
    window.localStorage.removeItem(LEGACY_LOCAL_STORAGE_WEB3_TOKEN);
  } catch {
    // ignore
  }
}

export const HEADER_ALCHEMY_API_KEY = "x-cidkeeper-alchemy-api-key";
export const HEADER_FOUR_EVERLAND_TOKEN = "x-cidkeeper-four-everland-token";

export function alchemyApiKeyFromRequest(req: Request): string | null {
  const fromHeader = req.headers.get(HEADER_ALCHEMY_API_KEY)?.trim();
  if (fromHeader) return fromHeader;
  const env = process.env.ALCHEMY_API_KEY?.trim();
  return env || null;
}

export function fourEverlandTokenFromRequest(req: Request): string | null {
  const fromHeader = req.headers.get(HEADER_FOUR_EVERLAND_TOKEN)?.trim();
  if (fromHeader) return fromHeader;
  const env = process.env.FOUR_EVERLAND_TOKEN?.trim();
  return env || null;
}
