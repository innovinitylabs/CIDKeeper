import { NextResponse } from "next/server";
import { getNftsForOwner } from "@/lib/alchemy";
import type { NftListScope } from "@/types/nft";
import { isEthereumAddress } from "@/lib/address";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const owner = searchParams.get("owner") ?? "";
    const scopeParam = searchParams.get("scope");
    const scope: NftListScope = scopeParam === "owned" || scopeParam === "all" ? "owned" : "created";

    if (!isEthereumAddress(owner)) {
      return NextResponse.json({ error: "invalid_wallet", message: "Owner must be a 0x-prefixed 40-hex address." }, { status: 400 });
    }

    const key = process.env.ALCHEMY_API_KEY;
    if (!key) {
      return NextResponse.json({ error: "server_misconfigured", message: "ALCHEMY_API_KEY is not set." }, { status: 500 });
    }

    const { nfts, pageErrors } = await getNftsForOwner(owner, key, { scope });
    return NextResponse.json({ nfts, pageErrors, scope });
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown_error";
    return NextResponse.json({ error: "nfts_failed", message, nfts: [], pageErrors: [message] }, { status: 200 });
  }
}
