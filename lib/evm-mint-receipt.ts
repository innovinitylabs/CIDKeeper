/**
 * Parse mint-related logs from an eth_getTransactionReceipt payload.
 * Used to expand "creator" mints: every ERC721/1155 mint (from zero) in a tx the wallet sent.
 */

const ZERO = "0x0000000000000000000000000000000000000000";
const ERC721_TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const ERC1155_TRANSFER_SINGLE = "0xc3d58168c5ae7397731d063d5bbf3d657854427343f4c083240f7aacaa2d0f62";

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
    }
  }

  return out;
}
