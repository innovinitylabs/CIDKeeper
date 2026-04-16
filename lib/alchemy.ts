import {
  collectMintedByWalletKeys,
  collectMintedToWalletKeys,
  mergeOwnedWithMintedByExtras,
} from "@/lib/minted-by-wallet";
import { nftKey } from "@/lib/nft-cids";
import type { NormalizedNft, NftListScope } from "@/types/nft";

export type { NftListScope } from "@/types/nft";

type AlchemyOwnedNft = {
  contract?: { address?: string };
  id?: { tokenId?: string };
  tokenUri?: string;
  tokenURI?: string;
  metadata?: Record<string, unknown> | null;
  title?: string;
  name?: string;
};

type AlchemyPage = {
  ownedNfts?: AlchemyOwnedNft[];
  pageKey?: string;
};

function pickName(nft: AlchemyOwnedNft, metadata: Record<string, unknown> | null): string | null {
  const direct = typeof nft.title === "string" ? nft.title : typeof nft.name === "string" ? nft.name : null;
  if (direct?.trim()) return direct.trim();
  const mName = metadata?.name;
  if (typeof mName === "string" && mName.trim()) return mName.trim();
  return null;
}

function normalizeOne(nft: AlchemyOwnedNft): NormalizedNft | null {
  const contractAddress = nft.contract?.address?.toLowerCase();
  const tokenId = nft.id?.tokenId;
  if (!contractAddress || !tokenId) return null;
  const tokenURI = nft.tokenUri ?? nft.tokenURI ?? null;
  const metadata =
    nft.metadata && typeof nft.metadata === "object" ? (nft.metadata as Record<string, unknown>) : null;
  return {
    contractAddress,
    tokenId,
    tokenURI,
    metadata,
    name: pickName(nft, metadata),
  };
}

export type FetchNftsResult = {
  nfts: NormalizedNft[];
  pageErrors: string[];
};

async function fetchAllOwned(owner: string, apiKey: string): Promise<FetchNftsResult> {
  const nfts: NormalizedNft[] = [];
  const pageErrors: string[] = [];
  let pageKey: string | undefined;

  const base = `https://eth-mainnet.g.alchemy.com/v2/${apiKey}/getNFTs`;

  for (let guard = 0; guard < 5000; guard++) {
    const url = new URL(base);
    url.searchParams.set("owner", owner);
    url.searchParams.set("withMetadata", "true");
    url.searchParams.set("pageSize", "100");
    if (pageKey) url.searchParams.set("pageKey", pageKey);

    let json: AlchemyPage;
    try {
      const res = await fetch(url.toString(), { method: "GET", cache: "no-store" });
      if (!res.ok) {
        pageErrors.push(`alchemy_page_http_${res.status}`);
        break;
      }
      json = (await res.json()) as AlchemyPage;
    } catch (e) {
      pageErrors.push(e instanceof Error ? e.message : "alchemy_fetch_failed");
      break;
    }

    const page = Array.isArray(json.ownedNfts) ? json.ownedNfts : [];
    for (const item of page) {
      const n = normalizeOne(item);
      if (n) nfts.push(n);
    }

    if (!json.pageKey) break;
    pageKey = json.pageKey;
  }

  return { nfts, pageErrors };
}

export async function getNftsForOwner(
  owner: string,
  apiKey: string,
  options?: { scope?: NftListScope },
): Promise<FetchNftsResult> {
  const { nfts: owned, pageErrors } = await fetchAllOwned(owner, apiKey);
  const scope: NftListScope = options?.scope ?? "mintedBy";

  if (scope === "all") {
    return { nfts: owned, pageErrors };
  }

  if (scope === "mintedTo") {
    try {
      const { keys, errors } = await collectMintedToWalletKeys(owner, apiKey);
      const filtered = owned.filter((n) => keys.has(nftKey(n)));
      return { nfts: filtered, pageErrors: [...pageErrors, ...errors] };
    } catch (e) {
      pageErrors.push(e instanceof Error ? e.message : "minted_to_filter_failed");
      return { nfts: owned, pageErrors };
    }
  }

  try {
    const { keys, errors } = await collectMintedByWalletKeys(owner, apiKey);
    const { nfts, errors: mergeErr } = await mergeOwnedWithMintedByExtras(apiKey, owned, keys);
    return { nfts, pageErrors: [...pageErrors, ...errors, ...mergeErr] };
  } catch (e) {
    pageErrors.push(e instanceof Error ? e.message : "minted_by_filter_failed");
    return { nfts: owned, pageErrors };
  }
}
