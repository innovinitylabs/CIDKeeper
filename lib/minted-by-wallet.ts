import { createConcurrencyLimiter } from "@/lib/ipfs";
import { fetchWithAlchemyRetry } from "@/lib/alchemy-fetch";
import { FOUNDATION_FACTORY_SET, mergeFoundationFactorySet } from "@/lib/foundation-factory";
import { extractMintedFromZeroInReceipt, type ReceiptLog } from "@/lib/evm-mint-receipt";
import { nftKey, normalizeTokenId, parseNftKey } from "@/lib/nft-cids";
import type { NormalizedNft } from "@/types/nft";

const ZERO = "0x0000000000000000000000000000000000000000";
const MAX_MINT_TO_WALLET_PAGES = 320;

type RpcJson<T> = { result?: T; error?: { message?: string } };

type AssetTransfer = {
  from?: string | null;
  to?: string | null;
  hash?: string | null;
  category?: string | null;
  tokenId?: string | null;
  erc721TokenId?: string | null;
  erc1155Metadata?: { tokenId?: string | null }[] | null;
  rawContract?: { address?: string | null };
};

type TxReceipt = {
  logs?: ReceiptLog[];
};

type TxMeta = {
  from: string;
  to: string | null;
};

const MARKETPLACE_TX_TO_ALLOWLIST = [
  "0x00000000000000ADc04C56Bf30AC9d3c0aAF14DC6",
  "0x000000000000Ad05Ccc4F10033630F133E005Cf08",
  "0x74312363F30F5aeF10aF5130Af366d34f002C256",
] as const;

function parseExtraTxToAllowlist(): Set<string> {
  const raw = (process.env.MINTED_BY_EXTRA_TX_TO_ALLOWLIST ?? "").trim();
  if (!raw) return new Set<string>();
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

function buildMarketplaceTxToSet(): Set<string> {
  const s = new Set<string>();
  for (const a of MARKETPLACE_TX_TO_ALLOWLIST) {
    s.add(a.toLowerCase());
  }
  for (const x of parseExtraTxToAllowlist()) {
    s.add(x);
  }
  return s;
}

function isZeroAddress(addr: string | null | undefined): boolean {
  if (!addr) return false;
  try {
    return BigInt(addr) === BigInt(0);
  } catch {
    return addr.toLowerCase() === ZERO;
  }
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

async function fetchTransactionMeta(apiKey: string, hash: string): Promise<TxMeta | null> {
  try {
    const json = await alchemyRpc<{ from?: string; to?: string } | null>(apiKey, "eth_getTransactionByHash", [hash]);
    const from = json.result?.from;
    if (typeof from !== "string") return null;
    const to = typeof json.result?.to === "string" ? json.result.to.toLowerCase() : null;
    return { from: from.toLowerCase(), to };
  } catch {
    return null;
  }
}

async function fetchReceipt(apiKey: string, hash: string): Promise<TxReceipt | null> {
  try {
    const json = await alchemyRpc<TxReceipt | null>(apiKey, "eth_getTransactionReceipt", [hash]);
    return json.result ?? null;
  } catch {
    return null;
  }
}

function transferToRows(t: AssetTransfer): { contract: string; tokenId: string; hash: string }[] {
  const hash = t.hash;
  const contract = t.rawContract?.address?.toLowerCase();
  if (!hash || !contract) return [];
  const cat = (t.category ?? "").toLowerCase();
  const out: { contract: string; tokenId: string; hash: string }[] = [];
  if (cat === "erc721") {
    const tid = t.tokenId ?? t.erc721TokenId;
    if (tid != null && tid !== "") out.push({ contract, tokenId: String(tid), hash });
  } else if (cat === "erc1155" && Array.isArray(t.erc1155Metadata)) {
    for (const m of t.erc1155Metadata) {
      const tid = m?.tokenId;
      if (tid == null) continue;
      out.push({ contract, tokenId: String(tid), hash });
    }
  }
  return out;
}

/**
 * Paginate ERC721/1155 mint transfers (from zero) to `wallet` (any contract).
 */
async function paginateMintTransfersToWallet(
  wallet: string,
  apiKey: string,
): Promise<{ rows: { contract: string; tokenId: string; hash: string }[]; errors: string[] }> {
  const errors: string[] = [];
  const rows: { contract: string; tokenId: string; hash: string }[] = [];
  let pageKey: string | undefined;

  for (let page = 0; page < MAX_MINT_TO_WALLET_PAGES; page++) {
    const params: Record<string, unknown> = {
      fromBlock: "0x0",
      toBlock: "latest",
      fromAddress: ZERO,
      toAddress: wallet,
      category: ["erc721", "erc1155"],
      excludeZeroValue: false,
      withMetadata: false,
      maxCount: "0x3e8",
      order: "asc",
    };
    if (pageKey) params.pageKey = pageKey;

    try {
      const json = await alchemyRpc<{ transfers?: AssetTransfer[]; pageKey?: string }>(
        apiKey,
        "alchemy_getAssetTransfers",
        [params],
      );
      const transfers = json.result?.transfers ?? [];
      for (const t of transfers) {
        if (!isZeroAddress(t.from ?? undefined)) continue;
        const to = (t.to ?? "").toLowerCase();
        if (to && to !== wallet.toLowerCase()) continue;
        for (const r of transferToRows(t)) {
          rows.push(r);
        }
      }
      const next = json.result?.pageKey;
      if (next && String(next).length > 0) {
        pageKey = String(next);
      } else {
        break;
      }
    } catch (e) {
      errors.push(e instanceof Error ? e.message : "mint_transfer_page_failed");
      break;
    }
  }

  return { rows, errors };
}

/**
 * mintedTo: zero-address mints where the recipient is this wallet (includes self-mints and airdrops).
 */
export async function collectMintedToWalletKeys(wallet: string, apiKey: string): Promise<{ keys: Set<string>; errors: string[] }> {
  const { rows, errors } = await paginateMintTransfersToWallet(wallet, apiKey);
  const keys = new Set<string>();
  for (const r of rows) {
    keys.add(nftKey({ contractAddress: r.contract, tokenId: r.tokenId }));
  }
  return { keys, errors };
}

type HashAgg = {
  rawContracts: Set<string>;
  hasTransferFromZero: boolean;
};

function shouldFetchReceiptBeforeParse(
  txTo: string | null,
  agg: HashAgg,
  enumeratedNft: Set<string>,
  marketplaceTxTo: Set<string>,
  foundationFactorySet: Set<string>,
): boolean {
  if (agg.hasTransferFromZero) return true;
  if (txTo == null) return true;
  const t = txTo.toLowerCase();
  if (foundationFactorySet.has(t)) return true;
  if (enumeratedNft.has(t)) return true;
  if (agg.rawContracts.has(t)) return true;
  if (marketplaceTxTo.has(t)) return true;
  return false;
}

/** Exposed for unit tests: gate before `eth_getTransactionReceipt` when no Transfer-from-zero appears in the index. */
export function shouldFetchCreatorMintReceipt(
  txTo: string | null,
  rawContractAddresses: string[],
  hasTransferFromZero: boolean,
  enumeratedNft: Set<string>,
  marketplaceTxTo: Set<string>,
  foundationFactorySet: Set<string> = FOUNDATION_FACTORY_SET,
): boolean {
  const agg: HashAgg = {
    rawContracts: new Set(rawContractAddresses.map((a) => a.toLowerCase())),
    hasTransferFromZero,
  };
  return shouldFetchReceiptBeforeParse(txTo, agg, enumeratedNft, marketplaceTxTo, foundationFactorySet);
}

/**
 * Creator mints: only wallet-initiated ERC721/1155 transfer rows, then selective receipts.
 * Never scans global mint history.
 */
export async function collectCreatorMintKeys(
  apiKey: string,
  wallet: string,
  options?: { enumeratedNftContracts?: Set<string>; extraFoundationFactoryAddresses?: string[] },
): Promise<{ keys: Set<string>; errors: string[] }> {
  const errors: string[] = [];
  const walletLower = wallet.toLowerCase();
  const keys = new Set<string>();
  const enumeratedNft = new Set<string>();
  for (const a of options?.enumeratedNftContracts ?? []) {
    if (a) enumeratedNft.add(a.toLowerCase());
  }
  const foundationFactorySet = mergeFoundationFactorySet(options?.extraFoundationFactoryAddresses ?? []);

  const maxPages = Math.max(1, Math.min(5000, Number(process.env.MINTED_BY_MAX_WALLET_TRANSFER_PAGES ?? 2000) || 2000));
  const maxKeys = Math.max(1, Math.min(50_000, Number(process.env.MINTED_BY_MAX_KEYS ?? 2000) || 2000));
  const fromBlock = (process.env.MINTED_BY_FROM_BLOCK ?? "0x0").trim() || "0x0";

  const byHash = new Map<string, HashAgg>();
  let pageKey: string | undefined;

  for (let page = 0; page < maxPages; page++) {
    const params: Record<string, unknown> = {
      fromBlock,
      toBlock: "latest",
      fromAddress: wallet,
      category: ["erc721", "erc1155"],
      excludeZeroValue: false,
      withMetadata: false,
      maxCount: "0x3e8",
      order: "asc",
    };
    if (pageKey) params.pageKey = pageKey;

    try {
      const json = await alchemyRpc<{ transfers?: AssetTransfer[]; pageKey?: string }>(
        apiKey,
        "alchemy_getAssetTransfers",
        [params],
      );
      const transfers = json.result?.transfers ?? [];
      for (const t of transfers) {
        const h = t.hash;
        if (typeof h !== "string" || !h.length) continue;
        const contract = t.rawContract?.address?.toLowerCase();
        let agg = byHash.get(h);
        if (!agg) {
          agg = { rawContracts: new Set(), hasTransferFromZero: false };
          byHash.set(h, agg);
        }
        if (contract) agg.rawContracts.add(contract);
        if (isZeroAddress(t.from ?? undefined)) {
          agg.hasTransferFromZero = true;
        }
      }
      const next = json.result?.pageKey;
      if (!next || String(next).length === 0) break;
      pageKey = String(next);
    } catch (e) {
      errors.push(e instanceof Error ? e.message : "wallet_erc_transfer_page_failed");
      break;
    }
    if (page === maxPages - 1) {
      errors.push(`minted_by_wallet_transfer_page_cap_${maxPages}`);
      break;
    }
  }

  const marketplaceTxTo = buildMarketplaceTxToSet();
  const uniqueHashes = [...byHash.keys()];
  const limit = createConcurrencyLimiter(
    Math.max(5, Math.min(10, Number(process.env.MINTED_BY_RECEIPT_CONCURRENCY ?? 6) || 6)),
  );

  await Promise.all(
    uniqueHashes.map((hash) =>
      limit(async () => {
        if (keys.size >= maxKeys) return;

        const agg = byHash.get(hash);
        if (!agg) return;

        const meta = await fetchTransactionMeta(apiKey, hash);
        if (!meta || meta.from !== walletLower) return;
        const txTo = meta.to;
        if (!shouldFetchReceiptBeforeParse(txTo, agg, enumeratedNft, marketplaceTxTo, foundationFactorySet)) {
          return;
        }

        const rec = await fetchReceipt(apiKey, hash);
        if (!rec?.logs) return;

        try {
          for (const m of extractMintedFromZeroInReceipt(rec.logs)) {
            keys.add(nftKey({ contractAddress: m.contract, tokenId: m.tokenId }));
            if (keys.size >= maxKeys) {
              errors.push(`creator_keys_cap_${maxKeys}`);
              return;
            }
          }
        } catch {
          errors.push(`receipt_parse_failed_${hash.slice(0, 10)}`);
        }
      }),
    ),
  );

  return { keys, errors };
}

export async function fetchNftMetadataAsNormalized(
  apiKey: string,
  contractAddress: string,
  tokenId: string,
): Promise<NormalizedNft> {
  const tid = normalizeTokenId(tokenId);

  const url = new URL(`https://eth-mainnet.g.alchemy.com/v2/${apiKey}/getNFTMetadata`);
  url.searchParams.set("contractAddress", contractAddress);
  url.searchParams.set("tokenId", tid);

  const res = await fetchWithAlchemyRetry(url.toString(), { method: "GET", cache: "no-store" });
  if (!res.ok) {
    return {
      contractAddress: contractAddress.toLowerCase(),
      tokenId: tid,
      tokenURI: null,
      metadata: null,
      name: null,
    };
  }

  const j = (await res.json()) as Record<string, unknown>;
  const contract =
    typeof j.contractAddress === "string"
      ? j.contractAddress.toLowerCase()
      : typeof (j.contract as { address?: string } | undefined)?.address === "string"
        ? String((j.contract as { address: string }).address).toLowerCase()
        : contractAddress.toLowerCase();

  const idBlock = j.id as { tokenId?: string } | undefined;
  const tokenIdOut = typeof idBlock?.tokenId === "string" ? idBlock.tokenId : tid;
  const tokenURI =
    typeof j.tokenUri === "string"
      ? j.tokenUri
      : typeof j.tokenURI === "string"
        ? j.tokenURI
        : null;
  const metadata = j.metadata && typeof j.metadata === "object" ? (j.metadata as Record<string, unknown>) : null;
  const name =
    typeof j.name === "string"
      ? j.name
      : typeof j.title === "string"
        ? j.title
        : typeof metadata?.name === "string"
          ? (metadata.name as string)
          : null;

  return {
    contractAddress: contract,
    tokenId: tokenIdOut,
    tokenURI,
    metadata,
    name: name?.trim() ? name.trim() : null,
  };
}

/**
 * Hydrate Alchemy metadata for each creator key (no ownership / getNFTs involved).
 */
export async function hydrateNftsFromKeys(apiKey: string, keys: Set<string>): Promise<{ nfts: NormalizedNft[]; errors: string[] }> {
  const errors: string[] = [];
  const ordered = [...keys].sort();
  const maxMeta = Math.max(1, Math.min(10_000, Number(process.env.MINTED_BY_MAX_METADATA_FETCH ?? 800) || 800));
  const slice = ordered.length > maxMeta ? ordered.slice(0, maxMeta) : ordered;
  if (ordered.length > maxMeta) {
    errors.push(`metadata_fetch_cap_${maxMeta}`);
  }

  const byKey = new Map<string, NormalizedNft>();
  const limit = createConcurrencyLimiter(4);

  await Promise.all(
    slice.map((k) =>
      limit(async () => {
        const parsed = parseNftKey(k);
        if (!parsed) return;
        try {
          const row = await fetchNftMetadataAsNormalized(apiKey, parsed.contractAddress, parsed.tokenId);
          byKey.set(k, row);
        } catch {
          byKey.set(k, {
            contractAddress: parsed.contractAddress,
            tokenId: parsed.tokenId,
            tokenURI: null,
            metadata: null,
            name: null,
          });
        }
      }),
    ),
  );

  const nfts: NormalizedNft[] = [];
  for (const k of ordered) {
    let n = byKey.get(k);
    if (!n) {
      const p = parseNftKey(k);
      if (p) {
        n = {
          contractAddress: p.contractAddress,
          tokenId: p.tokenId,
          tokenURI: null,
          metadata: null,
          name: null,
        };
      }
    }
    if (n) nfts.push(n);
  }

  return { nfts, errors };
}
