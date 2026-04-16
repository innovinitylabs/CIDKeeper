/**
 * Parse mint-related logs from an eth_getTransactionReceipt payload.
 * Used to expand "creator" mints: every ERC721/1155 mint (from zero) in a tx the wallet sent.
 */

const ZERO = "0x0000000000000000000000000000000000000000";
const ERC721_TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const ERC1155_TRANSFER_SINGLE = "0xc3d58168c5ae7397731d063d5bbf3d657854427343f4c083240f7aacaa2d0f62";
const ERC1155_TRANSFER_BATCH = "0x4a39dc06d4c0dbc64b70af90fd698a233a518aaf5b365db65035af1af898b484";

export type ReceiptLog = {
  address?: string;
  topics?: string[];
  data?: string;
};

function topicAddr(topic: string | undefined): string | null {
  if (!topic || !topic.startsWith("0x") || topic.length < 42) return null;
  return ("0x" + topic.slice(-40)).toLowerCase();
}

function topicUintStr(topic: string | undefined): string | null {
  if (!topic?.startsWith("0x")) return null;
  try {
    return BigInt(topic).toString();
  } catch {
    return null;
  }
}

function readDataWord(data: string | undefined, wordIndex: number): string | null {
  if (!data?.startsWith("0x")) return null;
  const hex = data.slice(2);
  const start = wordIndex * 64;
  if (hex.length < start + 64) return null;
  const w = "0x" + hex.slice(start, start + 64);
  try {
    return BigInt(w).toString();
  } catch {
    return null;
  }
}

/** Decode (uint256[] ids, uint256[] values) ABI tail used by ERC1155 TransferBatch non-indexed data. */
function decodeUint256ArrayPairData(data: string | undefined): string[] | null {
  if (!data?.startsWith("0x")) return null;
  const h = data.slice(2);
  if (h.length < 128) return null;
  const offIds = Number(BigInt("0x" + h.slice(0, 64)));
  const readDynArray = (byteOffset: number): string[] => {
    const hi = byteOffset * 2;
    if (hi + 64 > h.length) return [];
    const len = Number(BigInt("0x" + h.slice(hi, hi + 64)));
    if (!Number.isFinite(len) || len < 0 || len > 512) return [];
    const out: string[] = [];
    for (let i = 0; i < len; i++) {
      const start = hi + 64 + i * 64;
      const w = h.slice(start, start + 64);
      if (w.length < 64) break;
      try {
        out.push(BigInt("0x" + w).toString());
      } catch {
        break;
      }
    }
    return out;
  };
  const ids = readDynArray(offIds);
  return ids.length ? ids : null;
}

export function extractMintedFromZeroInReceipt(logs: ReceiptLog[]): { contract: string; tokenId: string }[] {
  const out: { contract: string; tokenId: string }[] = [];
  const seen = new Set<string>();

  const push = (contract: string, tokenId: string) => {
    const c = contract.toLowerCase();
    let tid: string;
    try {
      tid = BigInt(tokenId).toString();
    } catch {
      tid = tokenId;
    }
    const k = `${c}:${tid}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ contract: c, tokenId: tid });
  };

  for (const log of logs) {
    const contract = log.address?.toLowerCase();
    const topics = log.topics ?? [];
    const t0 = topics[0]?.toLowerCase();
    if (!contract || !t0) continue;

    if (t0 === ERC721_TRANSFER && topics.length >= 4) {
      const from = topicAddr(topics[1]);
      if (from !== ZERO) continue;
      const tid = topicUintStr(topics[3]);
      if (tid) push(contract, tid);
    } else if (t0 === ERC1155_TRANSFER_SINGLE && topics.length >= 4) {
      const from = topicAddr(topics[2]);
      if (from !== ZERO) continue;
      const tid = readDataWord(log.data, 0);
      if (tid) push(contract, tid);
    } else if (t0 === ERC1155_TRANSFER_BATCH && topics.length >= 4) {
      const from = topicAddr(topics[2]);
      if (from !== ZERO) continue;
      const ids = decodeUint256ArrayPairData(log.data);
      if (ids) {
        for (const tid of ids) {
          push(contract, tid);
        }
      }
    }
  }

  return out;
}
