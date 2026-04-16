import { isEthereumAddress } from "@/lib/address";

export const MAX_EXTRA_FOUNDATION_FACTORIES = 24;

export function sanitizeExtraFoundationFactories(addresses: unknown): string[] {
  if (!Array.isArray(addresses)) return [];
  const out: string[] = [];
  for (const x of addresses) {
    if (typeof x !== "string") continue;
    const t = x.trim();
    if (!isEthereumAddress(t)) continue;
    out.push(t.toLowerCase());
    if (out.length >= MAX_EXTRA_FOUNDATION_FACTORIES) break;
  }
  return out;
}

export function parseExtraFoundationFactoriesQueryParam(raw: string | null): string[] {
  const s = raw ?? "";
  return s
    .split(",")
    .map((x) => x.trim())
    .filter((x) => isEthereumAddress(x))
    .slice(0, MAX_EXTRA_FOUNDATION_FACTORIES);
}
