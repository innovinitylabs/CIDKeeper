import {
  collectCreatedContractAddresses,
  collectFoundationFactoryContractAddresses,
  fetchCreatedNftsFromContracts,
  filterCreatedNftContracts,
} from "@/lib/created-by-wallet";
import { collectCreatorMintKeys, hydrateNftsFromKeys } from "@/lib/minted-by-wallet";
import { isEthereumAddress } from "@/lib/address";
import { nftKey, pickUriString } from "@/lib/nft-cids";
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
  const tokenURI = pickUriString(nft.tokenUri ?? nft.tokenURI ?? null);
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

function scoreNormalizedNft(n: NormalizedNft): number {
  let s = 0;
  if (n.tokenURI) s += 2;
  if (n.metadata && Object.keys(n.metadata).length > 0) s += 2;
  if (n.name) s += 1;
  return s;
}

function mergeCreatedNftSources(contractNfts: NormalizedNft[], mintNfts: NormalizedNft[]): NormalizedNft[] {
  const byKey = new Map<string, NormalizedNft>();
  for (const n of contractNfts) {
    byKey.set(nftKey(n), n);
  }
  for (const n of mintNfts) {
    const k = nftKey(n);
    const existing = byKey.get(k);
    if (!existing) {
      byKey.set(k, n);
      continue;
    }
    if (scoreNormalizedNft(n) > scoreNormalizedNft(existing)) {
      byKey.set(k, n);
    }
  }
  return [...byKey.values()];
}

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
  options?: { scope?: NftListScope; includeFactoryCollections?: boolean; extraFoundationFactories?: string[] },
): Promise<FetchNftsResult> {
  const scope: NftListScope = options?.scope ?? "created";
  const includeFactoryCollections = options?.includeFactoryCollections !== false;
  const extraFoundationFactories = (options?.extraFoundationFactories ?? []).filter((a) => isEthereumAddress(a.trim()));

  if (scope === "owned") {
    return fetchAllOwned(owner, apiKey);
  }

  try {
    const deploymentPromise = collectCreatedContractAddresses(apiKey, owner);
    const factoryPromise = includeFactoryCollections
      ? collectFoundationFactoryContractAddresses(apiKey, owner, extraFoundationFactories)
      : Promise.resolve({ contracts: [] as string[], errors: [] as string[] });

    const [{ contracts: deployedContracts, errors: deploymentErrors }, { contracts: factoryContracts, errors: factoryErrors }] =
      await Promise.all([deploymentPromise, factoryPromise]);

    const trustedFactoryContracts = new Set<string>();
    for (const c of factoryContracts) {
      trustedFactoryContracts.add(c.toLowerCase());
    }

    const mergedContractAddresses = [
      ...new Set([...deployedContracts, ...factoryContracts].map((a) => a.toLowerCase())),
    ];

    const { contracts: nftContracts, errors: contractErrors } = await filterCreatedNftContracts(
      apiKey,
      owner,
      mergedContractAddresses,
      { trustedAddresses: trustedFactoryContracts },
    );

    const enumeratedNftContracts = new Set(nftContracts.map((a) => a.toLowerCase()));

    const [{ nfts: contractNfts, errors: nftErrors }, { keys: creatorMintKeys, errors: mintKeyErrors }] = await Promise.all([
      fetchCreatedNftsFromContracts(apiKey, nftContracts),
      collectCreatorMintKeys(apiKey, owner, {
        enumeratedNftContracts,
        extraFoundationFactoryAddresses: includeFactoryCollections ? extraFoundationFactories : undefined,
      }),
    ]);

    const { nfts: mintNfts, errors: hydrateErrors } = await hydrateNftsFromKeys(apiKey, creatorMintKeys);

    const nfts = mergeCreatedNftSources(contractNfts, mintNfts);

    const pageErrors = [
      ...deploymentErrors,
      ...(includeFactoryCollections ? factoryErrors : []),
      ...contractErrors,
      ...nftErrors,
      ...mintKeyErrors,
      ...hydrateErrors,
    ];

    return { nfts, pageErrors };
  } catch (e) {
    const message = e instanceof Error ? e.message : "created_filter_failed";
    return { nfts: [], pageErrors: [message] };
  }
}
