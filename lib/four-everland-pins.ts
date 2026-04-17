/** IPFS Pinning Service API base (4EVERLAND). See https://docs.4everland.org/storage/4ever-pin/pinning-services-api */
export const FOUR_EVERLAND_PINS_URL = "https://api.4everland.dev/pins";

/**
 * True if 4EVERLAND already lists a non-failed pin for this CID (queued, pinning, or pinned).
 * @see https://ipfs.github.io/pinning-services-api-spec/#operation/getPins
 */
export async function hasActivePinAtFourEverland(cid: string, token: string): Promise<boolean> {
  try {
    const url = new URL(FOUR_EVERLAND_PINS_URL);
    url.searchParams.set("cid", cid);
    url.searchParams.set("limit", "25");
    url.searchParams.set("status", "queued,pinning,pinned");

    const res = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      cache: "no-store",
    });
    if (!res.ok) return false;

    const text = await res.text();
    const j = JSON.parse(text) as { results?: { status?: string }[] };
    const rows = j.results ?? [];
    return rows.some((row) => Boolean(row.status) && row.status !== "failed");
  } catch {
    return false;
  }
}
