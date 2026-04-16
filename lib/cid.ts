/**
 * Extract a root IPFS CID from common tokenURI / gateway / ipfs:// strings.
 * Returns the first plausible CID segment (v0 Qm… or v1 baf…/bafk… etc.).
 */
const CID_V0 = /^Qm[1-9A-HJ-NP-Za-km-z]{44}$/;
const CID_V1 = /^baf[a-z2-7]{50,}$/;
const CID_V1_OTHER = /^ba[g-z][a-z0-9]{50,}$/;

function isLikelyCid(token: string): boolean {
  const t = token.trim();
  if (!t) return false;
  if (CID_V0.test(t)) return true;
  if (CID_V1.test(t)) return true;
  if (CID_V1_OTHER.test(t)) return true;
  return false;
}

function firstPathSegmentAfterIpfsPath(path: string): string | null {
  const parts = path.split("/").filter(Boolean);
  if (!parts.length) return null;
  const candidate = parts[0].split("?")[0];
  return isLikelyCid(candidate) ? candidate : null;
}

export function extractCID(url: string): string | null {
  const raw = url.trim();
  if (!raw) return null;

  if (raw.startsWith("ipfs://")) {
    const rest = raw.slice("ipfs://".length);
    const path = rest.split("#")[0].split("?")[0];
    if (path.startsWith("ipfs/")) {
      return firstPathSegmentAfterIpfsPath(path.slice("ipfs/".length));
    }
    return firstPathSegmentAfterIpfsPath(path);
  }

  const lower = raw.toLowerCase();
  const idx = lower.indexOf("/ipfs/");
  if (idx !== -1) {
    const after = raw.slice(idx + "/ipfs/".length);
    return firstPathSegmentAfterIpfsPath(after);
  }

  if (lower.includes("ipfs.io") || lower.includes("cloudflare-ipfs") || lower.includes("dweb.link")) {
    const m = raw.match(/\/ipfs\/([^/?#]+)/i);
    if (m?.[1] && isLikelyCid(m[1])) return m[1];
  }

  if (isLikelyCid(raw)) return raw;

  return null;
}

export function gatewayUrlsForCid(cid: string): string[] {
  const bases = [
    "https://ipfs.io/ipfs/",
    "https://cloudflare-ipfs.com/ipfs/",
    "https://dweb.link/ipfs/",
  ];
  return bases.map((b) => `${b}${cid}`);
}

/**
 * Build a single https preview URL that preserves path segments after the CID
 * (e.g. ipfs://Qm…/nft.png or https://ipfs.io/ipfs/Qm…/nft.png).
 * Browsers cannot load ipfs:// in img src; extractCID() alone drops subpaths.
 */
export function ipfsResourceToHttpPreviewUrl(uri: string): string | null {
  const raw = uri.trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();

  if (lower.startsWith("ipfs://")) {
    let path = raw.slice("ipfs://".length).split("#")[0].split("?")[0];
    if (path.startsWith("ipfs/")) path = path.slice("ipfs/".length);
    path = path.replace(/^\/+/, "");
    if (!path) return null;
    return `https://ipfs.io/ipfs/${path}`;
  }

  const idx = lower.indexOf("/ipfs/");
  if (idx !== -1) {
    let tail = raw.slice(idx + "/ipfs/".length).split("#")[0].split("?")[0];
    tail = tail.replace(/^\/+/, "");
    if (!tail) return null;
    return `https://ipfs.io/ipfs/${tail}`;
  }

  return null;
}
