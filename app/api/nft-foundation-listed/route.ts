import { NextResponse } from "next/server";
import { z } from "zod";
import { isEthereumAddress } from "@/lib/address";
import {
  decodeErc721OwnerOfResult,
  encodeErc721OwnerOfCalldata,
  isLikelyFoundationMarketEscrow,
  parseNftTokenIdToBigInt,
} from "@/lib/foundation-unlist";
import { alchemyApiKeyFromRequest } from "@/lib/user-provider-keys";

export const runtime = "nodejs";

const querySchema = z.object({
  contract: z.string().refine((s) => isEthereumAddress(s.trim()), "invalid contract"),
  tokenId: z.string().min(1),
});

export async function GET(req: Request) {
  const key = alchemyApiKeyFromRequest(req);
  if (!key) {
    return NextResponse.json({ listed: false, reason: "no_alchemy_key" });
  }

  const { searchParams } = new URL(req.url);
  const parsed = querySchema.safeParse({
    contract: searchParams.get("contract") ?? "",
    tokenId: searchParams.get("tokenId") ?? "",
  });
  if (!parsed.success) {
    return NextResponse.json({ listed: false, reason: "invalid_query" }, { status: 400 });
  }

  const contract = parsed.data.contract.trim().toLowerCase();
  const tid = parseNftTokenIdToBigInt(parsed.data.tokenId.trim());
  if (tid == null) {
    return NextResponse.json({ listed: false, reason: "invalid_token_id" }, { status: 400 });
  }

  const data = encodeErc721OwnerOfCalldata(tid);
  const url = `https://eth-mainnet.g.alchemy.com/v2/${encodeURIComponent(key)}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_call",
        params: [{ to: contract, data }, "latest"],
      }),
    });
    const json = (await res.json()) as { result?: string; error?: { message?: string } };
    if (!res.ok || json.error) {
      return NextResponse.json({ listed: false, reason: "rpc_error" });
    }
    const raw = json.result;
    if (typeof raw !== "string" || !raw.startsWith("0x")) {
      return NextResponse.json({ listed: false, reason: "bad_result" });
    }
    const owner = decodeErc721OwnerOfResult(raw as `0x${string}`);
    const listed = isLikelyFoundationMarketEscrow(owner);
    return NextResponse.json({ listed });
  } catch {
    return NextResponse.json({ listed: false, reason: "exception" });
  }
}
