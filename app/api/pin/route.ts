import { NextResponse } from "next/server";
import { z } from "zod";
import { downloadExactBytes, extensionFromContentType, limitConcurrency5 } from "@/lib/ipfs";
import { File, Web3Storage } from "web3.storage";

export const runtime = "nodejs";
export const maxDuration = 60;

const BodySchema = z.object({
  cids: z.array(z.string().min(3)).max(50),
});

export async function POST(req: Request) {
  try {
    const token = process.env.WEB3STORAGE_TOKEN;
    if (!token) {
      return NextResponse.json(
        { error: "pin_unavailable", message: "WEB3STORAGE_TOKEN is not configured on the server." },
        { status: 501 },
      );
    }

    const json = await req.json().catch(() => null);
    const parsed = BodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_body", issues: parsed.error.flatten() }, { status: 400 });
    }

    const client = new Web3Storage({ token });
    const cids = [...new Set(parsed.data.cids)];

    const results = await Promise.all(
      cids.map((inputCid) =>
        limitConcurrency5(async () => {
          try {
            const dl = await downloadExactBytes(inputCid);
            if (!dl.ok) {
              return { inputCid, outputCid: null as string | null, error: dl.error };
            }
            const ext = extensionFromContentType(dl.contentType);
            const name = `${inputCid}${ext}`;
            const file = new File([Buffer.from(dl.bytes)], name, {
              type: dl.contentType ?? "application/octet-stream",
            });
            const outputCid = await client.put([file], { wrapWithDirectory: false });
            return { inputCid, outputCid, error: null as string | null };
          } catch (e) {
            return {
              inputCid,
              outputCid: null as string | null,
              error: e instanceof Error ? e.message : "pin_failed",
            };
          }
        }),
      ),
    );

    return NextResponse.json({ results });
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown_error";
    return NextResponse.json({ error: "pin_route_failed", message, results: [] }, { status: 200 });
  }
}
