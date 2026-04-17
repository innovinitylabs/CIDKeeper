import { NextResponse } from "next/server";
import { z } from "zod";
import { hasActivePinAtFourEverland, FOUR_EVERLAND_PINS_URL } from "@/lib/four-everland-pins";
import { limitConcurrency5 } from "@/lib/ipfs";
import { fourEverlandTokenFromRequest } from "@/lib/user-provider-keys";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_ERROR_SNIPPET = 4000;

const BodySchema = z.object({
  cids: z.array(z.string().min(3)).max(50),
});

type PinResultRow = {
  cid: string;
  success: boolean;
  skipped?: boolean;
  error?: string;
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function pinCidOnce(cid: string, token: string): Promise<Response> {
  return fetch(FOUR_EVERLAND_PINS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ cid }),
    cache: "no-store",
  });
}

function interpretPinStatusBody(text: string): { ok: true } | { ok: false; error: string } {
  const trimmed = text.trim();
  if (!trimmed) return { ok: true };
  try {
    const j = JSON.parse(trimmed) as { status?: string; info?: Record<string, unknown> };
    if (j.status === "failed") {
      const details = j.info?.status_details;
      const msg =
        typeof details === "string" && details.trim()
          ? details.trim()
          : trimmed.length > MAX_ERROR_SNIPPET
            ? `${trimmed.slice(0, MAX_ERROR_SNIPPET)}...`
            : trimmed;
      return { ok: false, error: msg };
    }
    return { ok: true };
  } catch {
    return { ok: true };
  }
}

async function pinCidWithRetry(cid: string, token: string): Promise<PinResultRow> {
  try {
    const already = await hasActivePinAtFourEverland(cid, token);
    if (already) {
      return { cid, success: true, skipped: true };
    }

    let res = await pinCidOnce(cid, token);
    if (res.status === 429) {
      await sleep(500);
      res = await pinCidOnce(cid, token);
    }
    const text = await res.text();
    if (!res.ok) {
      const snippet = text.length > MAX_ERROR_SNIPPET ? `${text.slice(0, MAX_ERROR_SNIPPET)}...` : text;
      return { cid, success: false, error: snippet || `HTTP_${res.status}` };
    }
    const interpreted = interpretPinStatusBody(text);
    if (!interpreted.ok) {
      return { cid, success: false, error: interpreted.error };
    }
    return { cid, success: true };
  } catch (e) {
    return { cid, success: false, error: e instanceof Error ? e.message : "network_error" };
  }
}

export async function POST(req: Request) {
  try {
    const token = fourEverlandTokenFromRequest(req);
    if (!token) {
      return NextResponse.json(
        {
          error: "pin_unavailable",
          message:
            "No 4EVERLAND pin access token: add yours under Your API keys (4EVERLAND Pinning service), or set FOUR_EVERLAND_TOKEN on the server.",
        },
        { status: 501 },
      );
    }

    const json = await req.json().catch(() => null);
    const parsed = BodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_body", issues: parsed.error.flatten() }, { status: 400 });
    }

    const cids = [...new Set(parsed.data.cids)];

    const results = await Promise.all(
      cids.map((cid) => limitConcurrency5(() => pinCidWithRetry(cid, token))),
    );

    return NextResponse.json({ results });
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown_error";
    return NextResponse.json({ error: "pin_route_failed", message, results: [] }, { status: 200 });
  }
}
