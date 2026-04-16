import { NextResponse } from "next/server";
import { getNftsForOwner } from "@/lib/alchemy";
import { alchemyApiKeyFromRequest } from "@/lib/user-provider-keys";
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
    const includeFactoryParam = searchParams.get("includeFactoryCollections");
    const includeFactoryCollections = includeFactoryParam !== "false";

    if (!isEthereumAddress(owner)) {
      return NextResponse.json({ error: "invalid_wallet", message: "Owner must be a 0x-prefixed 40-hex address." }, { status: 400 });
    }

    const key = alchemyApiKeyFromRequest(req);
    if (!key) {
      return NextResponse.json(
        {
          error: "no_alchemy_key",
          message:
            "No Alchemy API key: add one under Your API keys in this app (stored in your browser) or set ALCHEMY_API_KEY on the server.",
        },
        { status: 401 },
      );
    }

    const { nfts, pageErrors } = await getNftsForOwner(owner, key, { scope, includeFactoryCollections });
    return NextResponse.json({ nfts, pageErrors, scope, includeFactoryCollections });
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown_error";
    return NextResponse.json({ error: "nfts_failed", message, nfts: [], pageErrors: [message] }, { status: 200 });
  }
}
