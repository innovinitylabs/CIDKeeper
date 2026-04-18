/** NFT list mode for /api/nfts and exports */
export type NftListScope = "created" | "owned";

export type HealthStatus = "alive" | "slow" | "arweave" | "dead" | "hosted";

export type ExportSource = "image" | "metadata" | "animation";

export type NormalizedNft = {
  contractAddress: string;
  tokenId: string;
  tokenURI: string | null;
  metadata: Record<string, unknown> | null;
  name: string | null;
};

export type ExtractedNftRow = {
  key: string;
  contractAddress: string;
  tokenId: string;
  name: string | null;
  metadataCID: string | null;
  imageCID: string | null;
  animationCID: string | null;
  previewUrl: string | null;
  primaryCID: string | null;
  primaryLabel: ExportSource | null;
  health: HealthStatus;
  healthMs: number | null;
  /** True if primary CID has an active 4EVERLAND pin; false if checked and not pinned; null if skipped (no token, Arweave primary, or no primary CID). */
  everlandPinned: boolean | null;
  errors: string[];
};

export type ManifestItem = {
  contractAddress: string;
  tokenId: string;
  metadataCID: string | null;
  imageCID: string | null;
  animationCID: string | null;
  file: string | null;
  source: ExportSource | null;
  /** alive when the primary export file bytes were recovered into the ZIP */
  status: "alive" | "dead";
};

export type Manifest = {
  wallet: string;
  total: number;
  recovered: number;
  failed: number;
  items: ManifestItem[];
};
