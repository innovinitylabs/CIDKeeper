import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";
import { normalize } from "viem/ens";
import { isEthereumAddress } from "@/lib/address";

/**
 * Basic check for mainnet-style *.eth names (ASCII labels). Full DNS validation is deferred to viem normalize().
 */
export function isEnsName(input: string): boolean {
  const s = input.trim();
  if (!s.endsWith(".eth")) return false;
  if (s.length < 5) return false;
  return /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*\.eth$/i.test(s);
}

export function isWalletOrEns(input: string): boolean {
  const t = input.trim();
  return isEthereumAddress(t) || isEnsName(t);
}

export type ResolveOwnerResult =
  | { ok: true; address: string; ensResolved: string | null }
  | { ok: false; error: string; message: string };

export async function resolveOwnerToAddress(ownerInput: string, alchemyApiKey: string): Promise<ResolveOwnerResult> {
  const raw = ownerInput.trim();
  if (!raw) {
    return { ok: false, error: "empty_owner", message: "Owner is required." };
  }
  if (isEthereumAddress(raw)) {
    return { ok: true, address: raw.toLowerCase(), ensResolved: null };
  }
  if (!isEnsName(raw)) {
    return {
      ok: false,
      error: "invalid_owner",
      message: "Owner must be a 0x-prefixed 40-hex address or a mainnet ENS name (e.g. name.eth).",
    };
  }
  try {
    const client = createPublicClient({
      chain: mainnet,
      transport: http(`https://eth-mainnet.g.alchemy.com/v2/${alchemyApiKey}`),
    });
    const name = normalize(raw);
    const address = await client.getEnsAddress({ name });
    if (!address) {
      return {
        ok: false,
        error: "ens_not_found",
        message: "That ENS name has no Ethereum address on mainnet, or could not be resolved.",
      };
    }
    return { ok: true, address: address.toLowerCase(), ensResolved: raw };
  } catch (e) {
    const message = e instanceof Error ? e.message : "ENS resolution failed.";
    return { ok: false, error: "ens_resolve_failed", message };
  }
}
