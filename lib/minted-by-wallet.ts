import { createConcurrencyLimiter } from "@/lib/ipfs";
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

function isZeroAddress(addr: string | null | undefined): boolean {
  if (!addr) return false;
  try {
    return BigInt(addr) === BigInt(0);
  } catch {
    return addr.toLowerCase() === ZERO;
  }
}

async function alchemyRpc<R>(apiKey: string, method: string, params: unknown[]): Promise<RpcJson<R>> {
  const res = await fetch(`https://eth-mainnet.g.alchemy.com/v2/${apiKey}`, {
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

async function fetchTxFromLower(apiKey: string, hash: string): Promise<string | null> {
  try {
    const json = await alchemyRpc<{ from?: string } | null>(apiKey, "eth_getTransactionByHash", [hash]);
    const from = json.result?.from;
    return typeof from === "string" ? from.toLowerCase() : null;
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

/**
 * mintedBy (creator): paginate ALL chain mint transfers (from == zero, no toAddress filter),
 * keep txs whose sender is `wallet`, then expand each receipt for every mint-from-zero in that tx.
 * Capped by env for RPC cost; may miss older mints if the cap is exceeded while scanning recent global mints.
 */
export async function collectCreatorMintKeys(apiKey: string, wallet: string): Promise<{ keys: Set<string>; errors: string[] }> {
  const errors: string[] = [];
  const walletLower = wallet.toLowerCase();
  const keys = new Set<string>();

  const maxPages = Math.max(1, Math.min(5000, Number(process.env.MINTED_BY_MAX_MINT_PAGES ?? 300) || 300));
  const maxKeys = Math.max(1, Math.min(50_000, Number(process.env.MINTED_BY_MAX_KEYS ?? 2000) || 2000));
  const fromBlock = (process.env.MINTED_BY_FROM_BLOCK ?? "0x0").trim() || "0x0";

  const txFromCache = new Map<string, string | null>();
  const receiptCache = new Map<string, TxReceipt | null>();
  const expandedHashes = new Set<string>();

  let pageKey: string | undefined;
  const limitTx = createConcurrencyLimiter(10);

  for (let page = 0; page < maxPages; page++) {
    const params: Record<string, unknown> = {
      fromBlock,
      toBlock: "latest",
      fromAddress: ZERO,
      category: ["erc721", "erc1155"],
      excludeZeroValue: false,
      withMetadata: false,
      maxCount: "0x3e8",
      order: "desc",
    };
    if (pageKey) params.pageKey = pageKey;

    let json: RpcJson<{ transfers?: AssetTransfer[]; pageKey?: string }>;
    try {
      json = await alchemyRpc<{ transfers?: AssetTransfer[]; pageKey?: string }>(
        apiKey,
        "alchemy_getAssetTransfers",
        [params],
      );
    } catch (e) {
      errors.push(e instanceof Error ? e.message : "global_mint_page_failed");
      break;
    }

    const transfers = json.result?.transfers ?? [];
    const pageHashes = new Set<string>();
    for (const t of transfers) {
      if (!isZeroAddress(t.from ?? undefined)) continue;
      const h = t.hash;
      if (typeof h === "string" && h.length) pageHashes.add(h);
    }

    await Promise.all(
      [...pageHashes].map((h) =>
        limitTx(async () => {
          if (txFromCache.has(h)) return;
          const from = await fetchTxFromLower(apiKey, h);
          txFromCache.set(h, from);
        }),
      ),
    );

    for (const h of pageHashes) {
      if (expandedHashes.has(h)) continue;
      const from = txFromCache.get(h);
      if (!from || from !== walletLower) continue;

      if (!receiptCache.has(h)) {
        receiptCache.set(h, await fetchReceipt(apiKey, h));
      }
      const rec = receiptCache.get(h) ?? null;

      expandedHashes.add(h);
      if (!rec?.logs) continue;

      try {
        for (const m of extractMintedFromZeroInReceipt(rec.logs)) {
          keys.add(nftKey({ contractAddress: m.contract, tokenId: m.tokenId }));
          if (keys.size >= maxKeys) {
            errors.push(`creator_keys_cap_${maxKeys}`);
            return { keys, errors };
          }
        }
      } catch {
        errors.push(`receipt_parse_failed_${h.slice(0, 10)}`);
      }
    }

    const next = json.result?.pageKey;
    if (!next || String(next).length === 0) {
      pageKey = undefined;
      break;
    }
    pageKey = String(next);
    if (page === maxPages - 1) {
      errors.push(`minted_by_mint_page_cap_${maxPages}`);
      break;
    }
  }

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

  const res = await fetch(url.toString(), { method: "GET", cache: "no-store" });
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
  const limit = createConcurrencyLimiter(8);

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
