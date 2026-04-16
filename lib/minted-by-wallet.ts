import { createConcurrencyLimiter } from "@/lib/ipfs";
import { extractMintedFromZeroInReceipt, type ReceiptLog } from "@/lib/evm-mint-receipt";
import { nftKey, normalizeTokenId, parseNftKey } from "@/lib/nft-cids";
import type { NormalizedNft } from "@/types/nft";

const ZERO = "0x0000000000000000000000000000000000000000";
const MAX_MINT_TO_WALLET_PAGES = 320;
const MAX_CREATOR_TX_RECEIPTS = 400;
const MAX_METADATA_FETCH = 400;

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
  const json = await alchemyRpc<{ from?: string } | null>(apiKey, "eth_getTransactionByHash", [hash]);
  const from = json.result?.from;
  return typeof from === "string" ? from.toLowerCase() : null;
}

async function fetchReceipt(apiKey: string, hash: string): Promise<TxReceipt | null> {
  const json = await alchemyRpc<TxReceipt | null>(apiKey, "eth_getTransactionReceipt", [hash]);
  return json.result ?? null;
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
 * Each row must have transfer.from == zero (Alchemy usually satisfies this for the query).
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
 * mintedBy: tx.from == wallet, using mint logs in those transactions (includes mints to other recipients in the same tx).
 * Discovery: paginate mint-to-wallet transfers, then expand each qualifying tx via receipt logs.
 * Note: mint transactions that never send a token to this wallet are not discoverable via this indexer alone.
 */
export async function collectMintedByWalletKeys(wallet: string, apiKey: string): Promise<{ keys: Set<string>; errors: string[] }> {
  const errors: string[] = [];
  const ownerLower = wallet.toLowerCase();
  const { rows, errors: pageErrors } = await paginateMintTransfersToWallet(wallet, apiKey);
  errors.push(...pageErrors);

  const hashSet = new Set(rows.map((r) => r.hash));

  const hashes = [...hashSet].slice(0, MAX_CREATOR_TX_RECEIPTS);
  if (hashSet.size > MAX_CREATOR_TX_RECEIPTS) {
    errors.push(`creator_tx_cap_${MAX_CREATOR_TX_RECEIPTS}`);
  }

  const limit = createConcurrencyLimiter(8);
  const keys = new Set<string>();

  await Promise.all(
    hashes.map((h) =>
      limit(async () => {
        const sender = await fetchTxFromLower(apiKey, h);
        if (!sender || sender !== ownerLower) return;
        const receipt = await fetchReceipt(apiKey, h);
        if (!receipt?.logs) return;
        const minted = extractMintedFromZeroInReceipt(receipt.logs);
        for (const m of minted) {
          keys.add(nftKey({ contractAddress: m.contract, tokenId: m.tokenId }));
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

export async function mergeOwnedWithMintedByExtras(
  apiKey: string,
  owned: NormalizedNft[],
  keys: Set<string>,
): Promise<{ nfts: NormalizedNft[]; errors: string[] }> {
  const errors: string[] = [];
  const byKey = new Map<string, NormalizedNft>();
  for (const n of owned) {
    byKey.set(nftKey(n), n);
  }

  const missing = [...keys].filter((k) => !byKey.has(k)).sort();
  const slice = missing.slice(0, MAX_METADATA_FETCH);
  if (missing.length > MAX_METADATA_FETCH) {
    errors.push(`metadata_fetch_cap_${MAX_METADATA_FETCH}`);
  }

  const limit = createConcurrencyLimiter(5);
  await Promise.all(
    slice.map((k) =>
      limit(async () => {
        const parsed = parseNftKey(k);
        if (!parsed) return;
        const row = await fetchNftMetadataAsNormalized(apiKey, parsed.contractAddress, parsed.tokenId);
        if (row) byKey.set(k, row);
      }),
    ),
  );

  const orderedKeys = [...keys].sort();
  const nfts: NormalizedNft[] = [];
  for (const k of orderedKeys) {
    const n = byKey.get(k);
    if (n) nfts.push(n);
  }

  return { nfts, errors };
}
