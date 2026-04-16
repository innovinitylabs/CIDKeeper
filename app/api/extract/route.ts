import { NextResponse } from "next/server";
import { z } from "zod";
import { checkCIDHealth, limitConcurrency5 } from "@/lib/ipfs";
import {
  extractCidsFromNft,
  nftKey,
  pickPrimaryExport,
  previewUrlFromNft,
} from "@/lib/nft-cids";
import type { ExtractedNftRow, NormalizedNft } from "@/types/nft";

export const runtime = "nodejs";
export const maxDuration = 60;

const NftSchema = z.object({
  contractAddress: z.string(),
  tokenId: z.string(),
  tokenURI: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  name: z.string().nullable().optional(),
});

const BodySchema = z.object({
  nfts: z.array(NftSchema),
});

export async function POST(req: Request) {
  try {
    const json = await req.json().catch(() => null);
    const parsed = BodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_body", issues: parsed.error.flatten() }, { status: 400 });
    }

    const nfts: NormalizedNft[] = parsed.data.nfts.map((n) => ({
      contractAddress: n.contractAddress.toLowerCase(),
      tokenId: n.tokenId,
      tokenURI: n.tokenURI ?? null,
      metadata: n.metadata ?? null,
      name: n.name ?? null,
    }));

    const primaryCids = new Set<string>();
    for (const nft of nfts) {
      const cids = extractCidsFromNft(nft);
      const primary = pickPrimaryExport(cids);
      if (primary.cid) primaryCids.add(primary.cid);
    }

    const healthByCid = new Map<string, Awaited<ReturnType<typeof checkCIDHealth>>>();
    await Promise.all(
      [...primaryCids].map((cid) =>
        limitConcurrency5(async () => {
          const h = await checkCIDHealth(cid);
          healthByCid.set(cid, h);
        }),
      ),
    );

    const rows: ExtractedNftRow[] = nfts.map((nft) => {
      const cids = extractCidsFromNft(nft);
      const primary = pickPrimaryExport(cids);
      const errors: string[] = [];
      const primaryCID = primary.cid;
      const healthResult = primaryCID ? healthByCid.get(primaryCID) : undefined;
      const health = primaryCID ? (healthResult?.status ?? "dead") : "dead";
      const healthMs = healthResult?.ms ?? null;

      if (!primaryCID) {
        errors.push("no_ipfs_cid_found_for_primary_asset");
      }

      return {
        key: nftKey(nft),
        contractAddress: nft.contractAddress,
        tokenId: nft.tokenId,
        name: nft.name,
        metadataCID: cids.metadataCID,
        imageCID: cids.imageCID,
        animationCID: cids.animationCID,
        previewUrl: previewUrlFromNft(nft, cids),
        primaryCID,
        primaryLabel: primary.source,
        health,
        healthMs,
        errors,
      };
    });

    return NextResponse.json({ rows });
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown_error";
    return NextResponse.json({ error: "extract_failed", message, rows: [] }, { status: 200 });
  }
}
