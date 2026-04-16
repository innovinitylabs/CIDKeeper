export const LOCAL_STORAGE_ALCHEMY_KEY = "cidkeeper_local_alchemy_api_key";
export const LOCAL_STORAGE_WEB3_TOKEN = "cidkeeper_local_web3storage_token";

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
