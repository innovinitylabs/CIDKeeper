import {
  collectCreatedContractAddresses,
  fetchCreatedNftsFromContracts,
  filterCreatedNftContracts,
} from "@/lib/created-by-wallet";
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
  const scope: NftListScope = options?.scope ?? "created";

  if (scope === "owned") {
    return fetchAllOwned(owner, apiKey);
  }

  try {
    const { contracts: deployedContracts, errors: deploymentErrors } = await collectCreatedContractAddresses(apiKey, owner);
    const { contracts: nftContracts, errors: contractErrors } = await filterCreatedNftContracts(
      apiKey,
      owner,
      deployedContracts,
    );
    const { nfts, errors: nftErrors } = await fetchCreatedNftsFromContracts(apiKey, nftContracts);
    return { nfts, pageErrors: [...deploymentErrors, ...contractErrors, ...nftErrors] };
  } catch (e) {
    const message = e instanceof Error ? e.message : "created_filter_failed";
    return { nfts: [], pageErrors: [message] };
  }
}
