import { createConcurrencyLimiter } from "@/lib/ipfs";
import { fetchWithAlchemyRetry } from "@/lib/alchemy-fetch";
import {
  extractFoundationFactoryCollectionAddresses,
  foundationFactoriesForAlchemyTransfers,
  mergeFoundationFactorySet,
} from "@/lib/foundation-factory";
import type { ReceiptLog } from "@/lib/evm-mint-receipt";
import { nftKey } from "@/lib/nft-cids";
import type { NormalizedNft } from "@/types/nft";

type RpcJson<T> = { result?: T; error?: { message?: string } };

type ExternalTransfer = {
  hash?: string | null;
  from?: string | null;
  to?: string | null;
};

type TxReceipt = {
  contractAddress?: string | null;
  logs?: ReceiptLog[];
};

type ContractMetadata = {
  address?: string | null;
  tokenType?: string | null;
  contractDeployer?: string | null;
};

type AlchemyContractNft = {
  contract?: { address?: string };
  tokenId?: string;
  tokenUri?: string;
  tokenURI?: string;
  image?: {
    cachedUrl?: string | null;
    thumbnailUrl?: string | null;
    pngUrl?: string | null;
    originalUrl?: string | null;
  } | null;
  metadata?: Record<string, unknown> | null;
  raw?: {
    tokenUri?: string | null;
    metadata?: Record<string, unknown> | null;
  } | null;
  title?: string;
  name?: string;
};

type ContractPage = {
  nfts?: AlchemyContractNft[];
  pageKey?: string;
  nextToken?: string;
};

function pickName(nft: AlchemyContractNft, metadata: Record<string, unknown> | null): string | null {
  const direct = typeof nft.title === "string" ? nft.title : typeof nft.name === "string" ? nft.name : null;
  if (direct?.trim()) return direct.trim();
  const mName = metadata?.name;
  if (typeof mName === "string" && mName.trim()) return mName.trim();
  return null;
}

function normalizeOne(nft: AlchemyContractNft): NormalizedNft | null {
  const contractAddress = nft.contract?.address?.toLowerCase();
  const tokenId = nft.tokenId;
  if (!contractAddress || !tokenId) return null;
  const tokenURI = nft.tokenUri ?? nft.tokenURI ?? nft.raw?.tokenUri ?? null;
  const metadataBase =
    nft.metadata && typeof nft.metadata === "object"
      ? (nft.metadata as Record<string, unknown>)
      : nft.raw?.metadata && typeof nft.raw.metadata === "object"
        ? (nft.raw.metadata as Record<string, unknown>)
        : null;
  const imageUrl = nft.image?.originalUrl ?? nft.image?.pngUrl ?? nft.image?.cachedUrl ?? nft.image?.thumbnailUrl ?? null;
  const metadata =
    metadataBase && metadataBase.image
      ? metadataBase
      : imageUrl
        ? { ...(metadataBase ?? {}), image: imageUrl }
        : metadataBase;
  return {
    contractAddress,
    tokenId,
    tokenURI,
    metadata,
    name: pickName(nft, metadata),
  };
}

async function alchemyRpc<R>(apiKey: string, method: string, params: unknown[]): Promise<RpcJson<R>> {
  const res = await fetchWithAlchemyRetry(`https://eth-mainnet.g.alchemy.com/v2/${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`alchemy_rpc_http_${res.status}`);
  const json = (await res.json()) as RpcJson<R> & { error?: { message?: string } };
  if (json.error?.message) throw new Error(json.error.message);
  return json;
}

async function fetchDeploymentReceipt(apiKey: string, hash: string): Promise<TxReceipt | null> {
  try {
    const json = await alchemyRpc<TxReceipt | null>(apiKey, "eth_getTransactionReceipt", [hash]);
    return json.result ?? null;
  } catch {
    return null;
  }
}

export async function collectFoundationFactoryContractAddresses(
  apiKey: string,
  wallet: string,
  extraFactories: string[] = [],
): Promise<{ contracts: string[]; errors: string[] }> {
  const errors: string[] = [];
  const walletLower = wallet.toLowerCase();
  const hashSet = new Set<string>();
  const limit = createConcurrencyLimiter(4);
  const factories = foundationFactoriesForAlchemyTransfers(extraFactories);
  const factoryLogSet = mergeFoundationFactorySet(extraFactories);

  for (const factory of factories) {
    const factoryLower = factory.toLowerCase();
    let pageKey: string | undefined;

    for (let page = 0; page < 5000; page++) {
      const params: Record<string, unknown> = {
        fromBlock: "0x0",
        toBlock: "latest",
        fromAddress: wallet,
        toAddress: factory,
        category: ["external", "internal"],
        excludeZeroValue: false,
        withMetadata: false,
        maxCount: "0x3e8",
        order: "asc",
      };
      if (pageKey) params.pageKey = pageKey;

      try {
        const json = await alchemyRpc<{ transfers?: ExternalTransfer[]; pageKey?: string }>(
          apiKey,
          "alchemy_getAssetTransfers",
          [params],
        );
        const pageTransfers = Array.isArray(json.result?.transfers) ? json.result?.transfers : [];
        for (const t of pageTransfers) {
          const to = typeof t.to === "string" ? t.to.toLowerCase() : null;
          if (to !== factoryLower) continue;
          const from = typeof t.from === "string" ? t.from.toLowerCase() : null;
          if (from && from !== walletLower) continue;
          const h = t.hash;
          if (typeof h === "string" && h.length) hashSet.add(h);
        }
        const next = json.result?.pageKey;
        if (!next) break;
        pageKey = String(next);
      } catch (e) {
        errors.push(e instanceof Error ? e.message : "foundation_factory_transfer_page_failed");
        break;
      }
    }
  }

  const receiptCache = new Map<string, TxReceipt | null>();
  const hashes = [...hashSet];

  await Promise.all(
    hashes.map((hash) =>
      limit(async () => {
        if (receiptCache.has(hash)) return;
        receiptCache.set(hash, await fetchDeploymentReceipt(apiKey, hash));
      }),
    ),
  );

  const seenAddr = new Set<string>();
  const contracts: string[] = [];

  for (const hash of hashes) {
    const rec = receiptCache.get(hash) ?? null;
    const found = extractFoundationFactoryCollectionAddresses(rec?.logs, walletLower, factoryLogSet);
    for (const a of found) {
      if (seenAddr.has(a)) continue;
      seenAddr.add(a);
      contracts.push(a);
    }
  }

  return { contracts, errors };
}

export function collectDeployedContractAddresses(
  transfers: ExternalTransfer[],
  receipts: Map<string, TxReceipt | null>,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  for (const transfer of transfers) {
    if (transfer.to != null) continue;
    const hash = transfer.hash;
    if (!hash) continue;
    const contractAddress = receipts.get(hash)?.contractAddress?.toLowerCase();
    if (!contractAddress || seen.has(contractAddress)) continue;
    seen.add(contractAddress);
    out.push(contractAddress);
  }

  return out;
}

export function filterSupportedCreatedContracts(
  wallet: string,
  contracts: ContractMetadata[],
  options?: { trustedAddresses?: Set<string> },
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const walletLower = wallet.toLowerCase();
  const trusted = options?.trustedAddresses ?? new Set<string>();

  for (const contract of contracts) {
    const address = contract.address?.toLowerCase();
    const tokenType = (contract.tokenType ?? "").toUpperCase();
    const deployer = contract.contractDeployer?.toLowerCase();
    if (!address || seen.has(address)) continue;
    const isTrusted = trusted.has(address);
    if (!isTrusted && deployer && deployer !== walletLower) continue;
    if (tokenType !== "ERC721" && tokenType !== "ERC1155") continue;
    seen.add(address);
    out.push(address);
  }

  return out;
}

export function normalizeContractNfts(items: AlchemyContractNft[]): NormalizedNft[] {
  const byKey = new Map<string, NormalizedNft>();
  for (const item of items) {
    const normalized = normalizeOne(item);
    if (!normalized) continue;
    byKey.set(nftKey(normalized), normalized);
  }
  return [...byKey.values()];
}

export async function collectCreatedContractAddresses(
  apiKey: string,
  wallet: string,
): Promise<{ contracts: string[]; errors: string[] }> {
  const errors: string[] = [];
  const transfers: ExternalTransfer[] = [];
  const receiptCache = new Map<string, TxReceipt | null>();
  const limit = createConcurrencyLimiter(4);
  let pageKey: string | undefined;

  for (let page = 0; page < 5000; page++) {
    const params: Record<string, unknown> = {
      fromBlock: "0x0",
      toBlock: "latest",
      fromAddress: wallet,
      category: ["external"],
      excludeZeroValue: false,
      withMetadata: false,
      maxCount: "0x3e8",
      order: "asc",
    };
    if (pageKey) params.pageKey = pageKey;

    try {
      const json = await alchemyRpc<{ transfers?: ExternalTransfer[]; pageKey?: string }>(
        apiKey,
        "alchemy_getAssetTransfers",
        [params],
      );
      const pageTransfers = Array.isArray(json.result?.transfers) ? json.result?.transfers : [];
      transfers.push(...pageTransfers);
      const next = json.result?.pageKey;
      if (!next) break;
      pageKey = String(next);
    } catch (e) {
      errors.push(e instanceof Error ? e.message : "deployment_transfer_page_failed");
      break;
    }
  }

  const deploymentHashes = [...new Set(transfers.filter((t) => t.to == null).map((t) => t.hash).filter(Boolean) as string[])];

  await Promise.all(
    deploymentHashes.map((hash) =>
      limit(async () => {
        if (receiptCache.has(hash)) return;
        receiptCache.set(hash, await fetchDeploymentReceipt(apiKey, hash));
      }),
    ),
  );

  return { contracts: collectDeployedContractAddresses(transfers, receiptCache), errors };
}

export async function filterCreatedNftContracts(
  apiKey: string,
  wallet: string,
  contractAddresses: string[],
  options?: { trustedAddresses?: Set<string> },
): Promise<{ contracts: string[]; errors: string[] }> {
  const errors: string[] = [];
  const meta: ContractMetadata[] = [];
  const limit = createConcurrencyLimiter(4);

  await Promise.all(
    contractAddresses.map((address) =>
      limit(async () => {
        try {
          const url = new URL(`https://eth-mainnet.g.alchemy.com/nft/v3/${apiKey}/getContractMetadata`);
          url.searchParams.set("contractAddress", address);
          const res = await fetchWithAlchemyRetry(url.toString(), { method: "GET", cache: "no-store" });
          if (!res.ok) {
            errors.push(`contract_metadata_http_${res.status}_${address.slice(0, 10)}`);
            return;
          }
          const json = (await res.json()) as ContractMetadata;
          meta.push(json);
        } catch {
          errors.push(`contract_metadata_failed_${address.slice(0, 10)}`);
        }
      }),
    ),
  );

  return {
    contracts: filterSupportedCreatedContracts(wallet, meta, { trustedAddresses: options?.trustedAddresses }),
    errors,
  };
}

export async function fetchCreatedNftsFromContracts(
  apiKey: string,
  contractAddresses: string[],
): Promise<{ nfts: NormalizedNft[]; errors: string[] }> {
  const errors: string[] = [];
  const allItems: AlchemyContractNft[] = [];

  for (const address of contractAddresses) {
    let startToken: string | undefined;

    for (let guard = 0; guard < 10000; guard++) {
      const url = new URL(`https://eth-mainnet.g.alchemy.com/nft/v3/${apiKey}/getNFTsForContract`);
      url.searchParams.set("contractAddress", address);
      url.searchParams.set("withMetadata", "true");
      url.searchParams.set("limit", "100");
      if (startToken) url.searchParams.set("startToken", startToken);

      try {
        const res = await fetchWithAlchemyRetry(url.toString(), { method: "GET", cache: "no-store" });
        if (!res.ok) {
          errors.push(`contract_nfts_http_${res.status}_${address.slice(0, 10)}`);
          break;
        }
        const json = (await res.json()) as ContractPage;
        if (Array.isArray(json.nfts)) allItems.push(...json.nfts);
        const next = json.pageKey ?? json.nextToken;
        if (!next) break;
        startToken = String(next);
      } catch {
        errors.push(`contract_nfts_failed_${address.slice(0, 10)}`);
        break;
      }
    }
  }

  return { nfts: normalizeContractNfts(allItems), errors };
}
