import { extractCID, gatewayUrlsForCid, ipfsResourceToHttpPreviewUrl } from "@/lib/cid";
import type { ExportSource, NormalizedNft } from "@/types/nft";

function pickUriString(v: unknown): string | null {
  if (typeof v === "string" && v.trim()) return v.trim();
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    const uri = o.uri ?? o.url ?? o.gateway ?? o.image;
    if (typeof uri === "string" && uri.trim()) return uri.trim();
  }
  return null;
}

function isArweaveUrl(value: string | null): boolean {
  if (!value) return false;
  const v = value.trim().toLowerCase();
  return v.startsWith("ar://") || v.includes("arweave.net/");
}

export type ExtractedCids = {
  metadataCID: string | null;
  imageCID: string | null;
  animationCID: string | null;
};

export function extractCidsFromNft(nft: NormalizedNft): ExtractedCids {
  const metadataCID = nft.tokenURI ? extractCID(nft.tokenURI) : null;

  const meta = nft.metadata;
  const imageRaw = meta ? pickUriString(meta.image) : null;
  const animationRaw = meta
    ? pickUriString(meta.animation_url ?? meta.animationUrl)
    : null;

  return {
    metadataCID,
    imageCID: imageRaw ? extractCID(imageRaw) : null,
    animationCID: animationRaw ? extractCID(animationRaw) : null,
  };
}

export function detectPrimaryStorage(nft: NormalizedNft): "ipfs" | "arweave" | "none" {
  const cids = extractCidsFromNft(nft);
  if (cids.imageCID || cids.metadataCID || cids.animationCID) return "ipfs";

  const meta = nft.metadata;
  const imageRaw = meta ? pickUriString(meta.image) : null;
  const animationRaw = meta ? pickUriString(meta.animation_url ?? meta.animationUrl) : null;

  if (isArweaveUrl(nft.tokenURI) || isArweaveUrl(imageRaw) || isArweaveUrl(animationRaw)) {
    return "arweave";
  }

  return "none";
}

export function pickPrimaryExport(
  cids: ExtractedCids,
): { cid: string | null; source: ExportSource | null } {
  if (cids.imageCID) return { cid: cids.imageCID, source: "image" };
  if (cids.metadataCID) return { cid: cids.metadataCID, source: "metadata" };
  if (cids.animationCID) return { cid: cids.animationCID, source: "animation" };
  return { cid: null, source: null };
}

export function previewUrlForImageCid(imageCID: string | null): string | null {
  if (!imageCID) return null;
  return gatewayUrlsForCid(imageCID)[0] ?? null;
}

export function previewUrlFromNft(nft: NormalizedNft, cids: ExtractedCids): string | null {
  const meta = nft.metadata;
  const imageRaw = meta
    ? pickUriString(meta.image) ?? pickUriString(meta.image_url ?? meta.imageUrl)
    : null;

  if (imageRaw) {
    const ipfsHttp = ipfsResourceToHttpPreviewUrl(imageRaw);
    if (ipfsHttp) return ipfsHttp;
  }

  if (cids.imageCID) return previewUrlForImageCid(cids.imageCID);
  if (imageRaw && (imageRaw.startsWith("http://") || imageRaw.startsWith("https://"))) {
    return imageRaw;
  }
  if (cids.metadataCID) {
    const base = gatewayUrlsForCid(cids.metadataCID)[0];
    if (base) return `${base}/nft.png`;
  }
  return null;
}

/** Normalize tokenId so hex and decimal forms match Alchemy + transfer APIs. */
export function normalizeTokenId(tokenId: string): string {
  const t = tokenId.trim();
  try {
    if (/^0x[0-9a-fA-F]+$/.test(t)) return BigInt(t).toString();
    return BigInt(t).toString();
  } catch {
    return t;
  }
}

export function nftKey(nft: Pick<NormalizedNft, "contractAddress" | "tokenId">): string {
  return `${nft.contractAddress.toLowerCase()}:${normalizeTokenId(nft.tokenId)}`;
}

/** Inverse of nftKey when keys were built with normalizeTokenId (contract is always 0x + 40 hex). */
export function parseNftKey(key: string): { contractAddress: string; tokenId: string } | null {
  const idx = key.indexOf(":");
  if (idx !== 42) return null;
  const contractAddress = key.slice(0, 42).toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(contractAddress)) return null;
  const tokenId = key.slice(43);
  if (!tokenId) return null;
  return { contractAddress, tokenId };
}
