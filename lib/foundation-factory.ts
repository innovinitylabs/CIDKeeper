import type { ReceiptLog } from "@/lib/evm-mint-receipt";
import { isEthereumAddress } from "@/lib/address";

export const FOUNDATION_FACTORIES = [
  "0x3B612a5B49e025a6e4bA4eE4FB1EF46D13588059",
  "0x612E2DadDc89d91409e40f946f9f7CfE422e777E",
] as const;

export const FOUNDATION_FACTORY_SET: Set<string> = new Set(
  FOUNDATION_FACTORIES.map((a) => a.toLowerCase()),
);

/** Built-in Foundation factories plus validated extras (lowercase), deduped. */
export function mergeFoundationFactorySet(extras: readonly string[]): Set<string> {
  const out = new Set(FOUNDATION_FACTORY_SET);
  for (const raw of extras) {
    const t = raw.trim();
    if (!isEthereumAddress(t)) continue;
    out.add(t.toLowerCase());
  }
  return out;
}

/**
 * Order preserved for Alchemy transfer scans: defaults first, then user-added addresses not in the built-in list.
 */
export function foundationFactoriesForAlchemyTransfers(extras: readonly string[]): string[] {
  const seen = new Set<string>();
  const list: string[] = [];
  for (const a of FOUNDATION_FACTORIES) {
    const l = a.toLowerCase();
    seen.add(l);
    list.push(a);
  }
  for (const raw of extras) {
    const t = raw.trim();
    if (!isEthereumAddress(t)) continue;
    const l = t.toLowerCase();
    if (seen.has(l)) continue;
    seen.add(l);
    list.push(l);
  }
  return list;
}

const ZERO = "0x0000000000000000000000000000000000000000";

export const NFT_COLLECTION_CREATED_TOPIC =
  "0x22bd5d982c942d99c12bfa4feda7e796b2b9d6a1b8097c890871b12de29963eb";

/** Pre-2023 Foundation factory: `CollectionCreated(address,address,uint256,string,string,uint256)` (same indexed layout as `NFTCollectionCreated`). */
export const LEGACY_COLLECTION_CREATED_TOPIC =
  "0xd3cbcb86b6ae20e08baf6a5fbaf0c922acff26cdc663bdf06744f5023bbcd254";

export const NFT_DROP_COLLECTION_CREATED_TOPIC =
  "0xea349a1d0c88438cb9fe73b6ea9d6389305d876c3faadf16c5039dd7a1be39fb";

function topicAddr(topic: string | undefined): string | null {
  if (!topic || !topic.startsWith("0x") || topic.length < 42) return null;
  return ("0x" + topic.slice(-40)).toLowerCase();
}

/**
 * Parse Foundation NFTCollectionFactory receipt logs for new collection proxy addresses.
 * Matches logs emitted from a known factory where the indexed creator is the wallet.
 */
export function extractFoundationFactoryCollectionAddresses(
  logs: ReceiptLog[] | undefined,
  walletLower: string,
  factoryLogAddressSet: Set<string> = FOUNDATION_FACTORY_SET,
): string[] {
  if (!Array.isArray(logs) || !logs.length) return [];
  const out: string[] = [];
  const seen = new Set<string>();

  for (const log of logs) {
    const fac = log.address?.toLowerCase();
    if (!fac || !factoryLogAddressSet.has(fac)) continue;
    const topics = log.topics ?? [];
    const t0 = topics[0]?.toLowerCase();
    if (!t0) continue;

    if (
      (t0 === NFT_COLLECTION_CREATED_TOPIC || t0 === LEGACY_COLLECTION_CREATED_TOPIC) &&
      topics.length >= 4
    ) {
      const collection = topicAddr(topics[1]);
      const creator = topicAddr(topics[2]);
      if (!collection || collection === ZERO || creator !== walletLower) continue;
      if (seen.has(collection)) continue;
      seen.add(collection);
      out.push(collection);
    } else if (t0 === NFT_DROP_COLLECTION_CREATED_TOPIC && topics.length >= 4) {
      const collection = topicAddr(topics[1]);
      const creator = topicAddr(topics[2]);
      if (!collection || collection === ZERO || creator !== walletLower) continue;
      if (seen.has(collection)) continue;
      seen.add(collection);
      out.push(collection);
    }
  }

  return out;
}
