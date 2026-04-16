import { NextResponse } from "next/server";
import { getNftsForOwner } from "@/lib/alchemy";
import { alchemyApiKeyFromRequest } from "@/lib/user-provider-keys";
import type { NftListScope } from "@/types/nft";
import { parseExtraFoundationFactoriesQueryParam } from "@/lib/extra-foundation-factories";
import { resolveOwnerToAddress } from "@/lib/resolve-owner";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const ownerRaw = searchParams.get("owner") ?? "";
    const scopeParam = searchParams.get("scope");
    const scope: NftListScope = scopeParam === "owned" || scopeParam === "all" ? "owned" : "created";
    const includeFactoryParam = searchParams.get("includeFactoryCollections");
    const includeFactoryCollections = includeFactoryParam !== "false";

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

    const resolvedOwner = await resolveOwnerToAddress(ownerRaw, key);
    if (!resolvedOwner.ok) {
      return NextResponse.json(
        { error: resolvedOwner.error, message: resolvedOwner.message },
        { status: resolvedOwner.error === "ens_not_found" ? 404 : 400 },
      );
    }
    const owner = resolvedOwner.address;

    const extraFoundationFactories = parseExtraFoundationFactoriesQueryParam(searchParams.get("extraFoundationFactories"));

    const { nfts, pageErrors } = await getNftsForOwner(owner, key, {
      scope,
      includeFactoryCollections,
      extraFoundationFactories,
    });
    return NextResponse.json({
      nfts,
      pageErrors,
      scope,
      includeFactoryCollections,
      extraFoundationFactories,
      ownerAddress: owner,
      ...(resolvedOwner.ensResolved ? { ensResolved: resolvedOwner.ensResolved } : {}),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown_error";
    return NextResponse.json({ error: "nfts_failed", message, nfts: [], pageErrors: [message] }, { status: 200 });
  }
}
