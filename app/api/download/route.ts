import { NextResponse } from "next/server";
import { z } from "zod";
import { getNftsForOwner } from "@/lib/alchemy";
import { isEthereumAddress } from "@/lib/address";
import { downloadExactBytes, extensionFromContentType, limitConcurrency5 } from "@/lib/ipfs";
import { extractCidsFromNft, normalizeTokenId, pickPrimaryExport } from "@/lib/nft-cids";
import { buildExportZip } from "@/lib/zip";
import type { Manifest, ManifestItem, NftListScope } from "@/types/nft";

export const runtime = "nodejs";
export const maxDuration = 60;

const BodySchema = z.object({
  wallet: z.string(),
  scope: z.enum(["created", "owned", "mintedBy", "all"]).optional(),
  selection: z
    .array(
      z.object({
        contract: z.string(),
        tokenId: z.string(),
      }),
    )
    .optional(),
});

function matchesSelection(
  nft: { contractAddress: string; tokenId: string },
  selection: { contract: string; tokenId: string }[] | undefined,
): boolean {
  if (!selection?.length) return true;
  return selection.some(
    (s) =>
      s.contract.toLowerCase() === nft.contractAddress.toLowerCase() &&
      normalizeTokenId(s.tokenId) === normalizeTokenId(nft.tokenId),
  );
}

export async function POST(req: Request) {
  try {
    const json = await req.json().catch(() => null);
    const parsed = BodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_body", issues: parsed.error.flatten() }, { status: 400 });
    }

    const wallet = parsed.data.wallet.trim();
    if (!isEthereumAddress(wallet)) {
      return NextResponse.json({ error: "invalid_wallet" }, { status: 400 });
    }

    const key = process.env.ALCHEMY_API_KEY;
    if (!key) {
      return NextResponse.json({ error: "server_misconfigured" }, { status: 500 });
    }

    const maxNfts = Math.max(1, Number(process.env.MAX_NFTS_FOR_ZIP ?? 150) || 150);

    const listScope: NftListScope = parsed.data.scope === "owned" || parsed.data.scope === "all" ? "owned" : "created";
    const fetched = await getNftsForOwner(wallet, key, { scope: listScope });
    const selected = fetched.nfts.filter((n) => matchesSelection(n, parsed.data.selection));

    if (selected.length > maxNfts) {
      return NextResponse.json(
        {
          error: "too_many_nfts",
          message: `This export would process ${selected.length} NFTs, but the serverless limit is ${maxNfts}. Narrow the selection or raise MAX_NFTS_FOR_ZIP with care.`,
          maxNfts,
          count: selected.length,
          pageErrors: fetched.pageErrors,
        },
        { status: 413 },
      );
    }

    const cidSet = new Set<string>();
    for (const nft of selected) {
      const c = extractCidsFromNft(nft);
      for (const x of [c.metadataCID, c.imageCID, c.animationCID] as const) {
        if (x) cidSet.add(x);
      }
    }

    const byCid = new Map<string, { filename: string; bytes: Uint8Array }>();

    await Promise.all(
      [...cidSet].map((cid) =>
        limitConcurrency5(async () => {
          const r = await downloadExactBytes(cid);
          if (!r.ok) return;
          const ext = extensionFromContentType(r.contentType);
          const filename = `${cid}${ext}`;
          byCid.set(cid, { filename, bytes: r.bytes });
        }),
      ),
    );

    const items: ManifestItem[] = selected.map((nft) => {
      const cids = extractCidsFromNft(nft);
      const primary = pickPrimaryExport(cids);
      const file =
        primary.cid && byCid.has(primary.cid) ? (byCid.get(primary.cid)?.filename ?? null) : null;
      const status: ManifestItem["status"] = file ? "alive" : "dead";
      return {
        contractAddress: nft.contractAddress,
        tokenId: nft.tokenId,
        metadataCID: cids.metadataCID,
        imageCID: cids.imageCID,
        animationCID: cids.animationCID,
        file,
        source: primary.source,
        status,
      };
    });

    const recovered = items.filter((i) => i.status === "alive").length;
    const failed = items.length - recovered;

    const manifest: Manifest = {
      wallet,
      total: items.length,
      recovered,
      failed,
      items,
    };

    const zipBytes = await buildExportZip(manifest, byCid);

    const filename = `cidkeeper-${wallet.slice(2, 8)}-${wallet.slice(-6)}.zip`;

    return new NextResponse(Buffer.from(zipBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown_error";
    return NextResponse.json({ error: "download_failed", message }, { status: 200 });
  }
}
