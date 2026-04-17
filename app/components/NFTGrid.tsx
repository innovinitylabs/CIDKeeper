"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FoundationUnlistIfListed } from "@/app/components/FoundationUnlistIfListed";
import { NftAssetLightbox } from "@/app/components/NftAssetLightbox";
import { createConcurrencyLimiter } from "@/lib/ipfs";
import { detectPrimaryStorage, extractCidsFromNft, nftKey, previewUrlFromNft } from "@/lib/nft-cids";
import { HEADER_ALCHEMY_API_KEY } from "@/lib/user-provider-keys";
import type { ExtractedNftRow, NormalizedNft } from "@/types/nft";

type StorageFilter = "all" | "ipfs" | "arweave" | "none";
type PinFilter = "all" | "pinned" | "unpinned" | "pin_na";
type ListingFilter = "all" | "listed" | "not_listed";
type SortKey = "default" | "name_az" | "name_za" | "health_worst" | "health_best" | "token_asc" | "token_desc";

function healthRank(h: ExtractedNftRow["health"]): number {
  if (h === "dead") return 0;
  if (h === "slow") return 1;
  if (h === "alive") return 2;
  return 3;
}

function rowHealth(nft: NormalizedNft, row: ExtractedNftRow | undefined): ExtractedNftRow["health"] {
  const storage = detectPrimaryStorage(nft);
  return row?.health ?? (storage === "arweave" ? "arweave" : "dead");
}

function compareTokenIds(a: string, b: string): number {
  try {
    const ba = BigInt(a);
    const bb = BigInt(b);
    if (ba < bb) return -1;
    if (ba > bb) return 1;
    return 0;
  } catch {
    return a.localeCompare(b, undefined, { numeric: true });
  }
}

type Props = {
  nfts: NormalizedNft[];
  rows: ExtractedNftRow[] | null;
  selectedKeys: Set<string>;
  onToggle: (key: string) => void;
  onToggleAll: (keys: string[], next: boolean) => void;
  providerHeaders: Record<string, string>;
};

function badgeClass(health: ExtractedNftRow["health"]) {
  if (health === "alive") return "bg-emerald-500/15 text-emerald-800 ring-emerald-500/30 dark:text-emerald-200 dark:ring-emerald-500/35";
  if (health === "slow") return "bg-amber-500/15 text-amber-900 ring-amber-500/30 dark:text-amber-100";
  if (health === "arweave") return "bg-sky-500/15 text-sky-900 ring-sky-500/30 dark:text-sky-100";
  return "bg-rose-500/15 text-rose-900 ring-rose-500/30 dark:text-rose-100";
}

function everlandPinBadgeClass(pinned: boolean) {
  if (pinned) {
    return "bg-violet-500/15 text-violet-900 ring-violet-500/30 dark:text-violet-100 dark:ring-violet-500/35";
  }
  return "bg-zinc-200/90 text-zinc-700 ring-zinc-400/40 dark:bg-zinc-800/80 dark:text-zinc-200 dark:ring-zinc-600/50";
}

export function NFTGrid({ nfts, rows, selectedKeys, onToggle, onToggleAll, providerHeaders }: Props) {
  const [copiedValue, setCopiedValue] = useState<string | null>(null);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(() => new Set());
  const [lightboxKey, setLightboxKey] = useState<string | null>(null);
  const [storageFilter, setStorageFilter] = useState<StorageFilter>("all");
  const [healthFilter, setHealthFilter] = useState<ExtractedNftRow["health"] | "all">("all");
  const [pinFilter, setPinFilter] = useState<PinFilter>("all");
  const [listingFilter, setListingFilter] = useState<ListingFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("default");
  const [foundationByKey, setFoundationByKey] = useState<Record<string, boolean> | null>(null);
  const [foundationLoading, setFoundationLoading] = useState(false);
  const [foundationError, setFoundationError] = useState<string | null>(null);
  const foundationAbortRef = useRef<AbortController | null>(null);

  const rowByKey = new Map<string, ExtractedNftRow>();
  if (rows) for (const r of rows) rowByKey.set(r.key, r);

  const nftsSignature = useMemo(() => nfts.map((n) => nftKey(n)).join("\n"), [nfts]);

  useEffect(() => {
    foundationAbortRef.current?.abort();
    foundationAbortRef.current = null;
    setFoundationByKey(null);
    setFoundationLoading(false);
    setFoundationError(null);
    setListingFilter("all");
  }, [nftsSignature]);

  useEffect(() => {
    return () => {
      foundationAbortRef.current?.abort();
    };
  }, []);

  const resolveFoundationListings = useCallback(async () => {
    const ak = providerHeaders[HEADER_ALCHEMY_API_KEY]?.trim() ?? "";
    if (!ak) {
      setFoundationError("Add an Alchemy API key (Your API keys) to resolve Foundation listings.");
      return;
    }
    if (!nfts.length) return;
    foundationAbortRef.current?.abort();
    const ac = new AbortController();
    foundationAbortRef.current = ac;
    setFoundationError(null);
    setFoundationLoading(true);
    const limit = createConcurrencyLimiter(5);
    const out: Record<string, boolean> = {};
    try {
      await Promise.all(
        nfts.map((nft) =>
          limit(async () => {
            if (ac.signal.aborted) return;
            const key = nftKey(nft);
            const headers: Record<string, string> = { [HEADER_ALCHEMY_API_KEY]: ak };
            const res = await fetch(
              `/api/nft-foundation-listed?contract=${encodeURIComponent(nft.contractAddress.trim())}&tokenId=${encodeURIComponent(nft.tokenId.trim())}`,
              { headers, cache: "no-store", signal: ac.signal },
            );
            const j = (await res.json().catch(() => ({}))) as { listed?: boolean };
            if (ac.signal.aborted) return;
            out[key] = Boolean(j.listed);
          }),
        ),
      );
      if (!ac.signal.aborted) {
        setFoundationByKey(out);
      }
    } catch (e) {
      if (!ac.signal.aborted) {
        setFoundationError(e instanceof Error ? e.message : "Could not resolve Foundation listings.");
      }
    } finally {
      if (!ac.signal.aborted) {
        setFoundationLoading(false);
      }
    }
  }, [nfts, providerHeaders]);

  const visibleNfts = useMemo(() => {
    let list = nfts.filter((nft) => {
      const key = nftKey(nft);
      const row = rowByKey.get(key);
      const storage = detectPrimaryStorage(nft);
      if (storageFilter === "ipfs" && storage !== "ipfs") return false;
      if (storageFilter === "arweave" && storage !== "arweave") return false;
      if (storageFilter === "none" && storage !== "none") return false;

      const health = rowHealth(nft, row);
      if (healthFilter !== "all" && health !== healthFilter) return false;

      const pin = row?.everlandPinned ?? null;
      if (pinFilter === "pinned" && pin !== true) return false;
      if (pinFilter === "unpinned" && pin !== false) return false;
      if (pinFilter === "pin_na" && pin !== null) return false;

      if (listingFilter !== "all" && foundationByKey) {
        const listed = Boolean(foundationByKey[key]);
        if (listingFilter === "listed" && !listed) return false;
        if (listingFilter === "not_listed" && listed) return false;
      }

      return true;
    });

    const titleFor = (nft: NormalizedNft) => {
      const k = nftKey(nft);
      return rowByKey.get(k)?.name ?? nft.name ?? "";
    };

    if (sortKey === "name_az") {
      list = [...list].sort((a, b) => titleFor(a).localeCompare(titleFor(b), undefined, { sensitivity: "base" }));
    } else if (sortKey === "name_za") {
      list = [...list].sort((a, b) => titleFor(b).localeCompare(titleFor(a), undefined, { sensitivity: "base" }));
    } else if (sortKey === "health_worst") {
      list = [...list].sort(
        (a, b) => healthRank(rowHealth(a, rowByKey.get(nftKey(a)))) - healthRank(rowHealth(b, rowByKey.get(nftKey(b)))),
      );
    } else if (sortKey === "health_best") {
      list = [...list].sort(
        (a, b) => healthRank(rowHealth(b, rowByKey.get(nftKey(b)))) - healthRank(rowHealth(a, rowByKey.get(nftKey(a)))),
      );
    } else if (sortKey === "token_asc") {
      list = [...list].sort((a, b) => compareTokenIds(a.tokenId, b.tokenId));
    } else if (sortKey === "token_desc") {
      list = [...list].sort((a, b) => compareTokenIds(b.tokenId, a.tokenId));
    }

    return list;
  }, [
    nfts,
    rows,
    storageFilter,
    healthFilter,
    pinFilter,
    listingFilter,
    foundationByKey,
    sortKey,
  ]);

  const keys = visibleNfts.map((n) => nftKey(n));
  const allSelected = keys.length > 0 && keys.every((k) => selectedKeys.has(k));

  const filtersActive =
    storageFilter !== "all" ||
    healthFilter !== "all" ||
    pinFilter !== "all" ||
    listingFilter !== "all" ||
    sortKey !== "default";

  const clearFilters = useCallback(() => {
    setStorageFilter("all");
    setHealthFilter("all");
    setPinFilter("all");
    setListingFilter("all");
    setSortKey("default");
  }, []);

  async function copyValue(value: string) {
    if (!value || value === "—") return;
    try {
      await navigator.clipboard.writeText(value);
      setCopiedValue(value);
      window.setTimeout(() => {
        setCopiedValue((current) => (current === value ? null : current));
      }, 1400);
    } catch {
      setCopiedValue(null);
    }
  }

  function toggleExpanded(key: string, open: boolean) {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (open) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  const lightboxProps = useMemo(() => {
    if (!lightboxKey) return null;
    const nft = nfts.find((n) => nftKey(n) === lightboxKey);
    if (!nft) return null;
    const k = nftKey(nft);
    const row = rowByKey.get(k);
    const previewUrl = row?.previewUrl ?? previewUrlFromNft(nft, extractCidsFromNft(nft));
    const title = row?.name ?? nft.name ?? `Token ${nft.tokenId}`;
    const health = rowHealth(nft, row);
    return { nft, row, previewUrl, displayTitle: title, health };
  }, [lightboxKey, nfts, rows]);

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="space-y-4 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">Collection</div>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              Showing {visibleNfts.length} of {nfts.length}
              {filtersActive ? " (filters active)" : ""}
            </p>
          </div>
          <label className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={(e) => onToggleAll(keys, e.target.checked)}
              className="rounded border-zinc-300 text-brand focus:ring-brand dark:border-zinc-600"
            />
            Select all in view
          </label>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex min-w-[128px] flex-1 flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">Storage</span>
            <select
              value={storageFilter}
              onChange={(e) => setStorageFilter(e.target.value as StorageFilter)}
              className="rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-xs text-zinc-900 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
            >
              <option value="all">All</option>
              <option value="ipfs">IPFS primary</option>
              <option value="arweave">Arweave primary</option>
              <option value="none">No primary CID</option>
            </select>
          </label>
          <label className="flex min-w-[128px] flex-1 flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">Gateway health</span>
            <select
              value={healthFilter}
              onChange={(e) => setHealthFilter(e.target.value as typeof healthFilter)}
              className="rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-xs text-zinc-900 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
            >
              <option value="all">All</option>
              <option value="alive">alive</option>
              <option value="slow">slow</option>
              <option value="dead">dead</option>
              <option value="arweave">arweave</option>
            </select>
          </label>
          <label className="flex min-w-[140px] flex-1 flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">4EVER pin</span>
            <select
              value={pinFilter}
              onChange={(e) => setPinFilter(e.target.value as PinFilter)}
              className="rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-xs text-zinc-900 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
            >
              <option value="all">All</option>
              <option value="pinned">Pinned</option>
              <option value="unpinned">Unpinned</option>
              <option value="pin_na">N/A (Arweave or unchecked)</option>
            </select>
          </label>
          <label className="flex min-w-[160px] flex-1 flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">Foundation listing</span>
            <select
              value={listingFilter}
              onChange={(e) => setListingFilter(e.target.value as ListingFilter)}
              className="rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-xs text-zinc-900 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
            >
              <option value="all">All</option>
              <option value="listed" disabled={foundationByKey == null}>
                Listed on Foundation
              </option>
              <option value="not_listed" disabled={foundationByKey == null}>
                Not listed
              </option>
            </select>
          </label>
          <label className="flex min-w-[160px] flex-1 flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">Sort</span>
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              className="rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-xs text-zinc-900 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
            >
              <option value="default">Wallet order</option>
              <option value="name_az">Name A–Z</option>
              <option value="name_za">Name Z–A</option>
              <option value="health_worst">Health (worst first)</option>
              <option value="health_best">Health (best first)</option>
              <option value="token_asc">Token id (low to high)</option>
              <option value="token_desc">Token id (high to low)</option>
            </select>
          </label>
          <button
            type="button"
            onClick={() => void resolveFoundationListings()}
            disabled={foundationLoading || nfts.length === 0}
            className="shrink-0 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 shadow-sm hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
          >
            {foundationLoading ? "Resolving listings…" : "Resolve Foundation listings"}
          </button>
          {filtersActive ? (
            <button
              type="button"
              onClick={clearFilters}
              className="shrink-0 rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Clear filters
            </button>
          ) : null}
        </div>
        {foundationByKey == null ? (
          <p className="text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
            Foundation filters stay disabled until you run Resolve Foundation listings (one Alchemy-backed check per NFT,
            same as the per-row listing check).
          </p>
        ) : null}
        {foundationError ? (
          <p className="text-[11px] font-medium text-rose-600 dark:text-rose-400">{foundationError}</p>
        ) : null}
      </div>
      <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
        {visibleNfts.map((nft) => {
          const key = nftKey(nft);
          const row = rowByKey.get(key);
          const title = row?.name ?? nft.name ?? `Token ${nft.tokenId}`;
          const cid = row?.primaryCID ?? "—";
          const storage = detectPrimaryStorage(nft);
          const health = rowHealth(nft, row);
          const listedOverride =
            foundationByKey != null && Object.prototype.hasOwnProperty.call(foundationByKey, key)
              ? foundationByKey[key]
              : undefined;
          const previewUrl = row?.previewUrl ?? previewUrlFromNft(nft, extractCidsFromNft(nft));
          const rawNft = JSON.stringify(nft, null, 2);
          const rawRow = row ? JSON.stringify(row, null, 2) : null;

          return (
            <li key={key} className="p-4">
              <details open={expandedKeys.has(key)} onToggle={(e) => toggleExpanded(key, e.currentTarget.open)}>
                <summary
                  className="list-none cursor-pointer"
                  onClickCapture={(e) => {
                    if ((e.target as HTMLElement).closest("[data-nft-thumb]")) {
                      e.preventDefault();
                    }
                  }}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <div className="flex items-start gap-3 sm:w-72">
                      <input
                        type="checkbox"
                        checked={selectedKeys.has(key)}
                        onChange={() => onToggle(key)}
                        onClick={(e) => e.stopPropagation()}
                        className="mt-1 rounded border-zinc-300 text-brand focus:ring-brand dark:border-zinc-600"
                      />
                      <div
                        data-nft-thumb
                        role="button"
                        tabIndex={0}
                        title="View larger"
                        className="h-14 w-14 shrink-0 cursor-zoom-in overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100 outline-none ring-brand/0 transition hover:ring-2 hover:ring-brand/40 focus-visible:ring-2 focus-visible:ring-brand dark:border-zinc-800 dark:bg-zinc-900"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setLightboxKey(key);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            e.stopPropagation();
                            setLightboxKey(key);
                          }
                        }}
                      >
                        {previewUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={previewUrl} alt="" className="h-full w-full object-cover" loading="lazy" draggable={false} />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-[10px] text-zinc-400">No preview</div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-50">{title}</div>
                        <div className="mt-0.5 font-mono text-[11px] text-zinc-700 dark:text-zinc-200">
                          <span className="text-zinc-500 dark:text-zinc-500">Contract </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              copyValue(nft.contractAddress);
                            }}
                            className="inline break-all text-left text-zinc-500 transition hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
                            title="Click to copy NFT contract address"
                          >
                            {nft.contractAddress}
                          </button>
                        </div>
                        {copiedValue === nft.contractAddress ? (
                          <div className="mt-1 text-[11px] font-medium text-brand dark:text-brand-light">Copied</div>
                        ) : null}
                      </div>
                    </div>
                    <div className="min-w-0 flex-1 space-y-1 sm:pl-2">
                      <div className="font-mono text-xs text-zinc-700 dark:text-zinc-200">
                        <span className="text-zinc-500 dark:text-zinc-500">CID </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            copyValue(cid);
                          }}
                          className="inline break-all text-left transition hover:text-brand dark:hover:text-brand-light"
                          title={cid === "—" ? "No CID available" : "Click to copy CID"}
                        >
                          {cid}
                        </button>
                        {copiedValue === cid && cid !== "—" ? (
                          <span className="ml-2 text-[11px] font-sans font-medium text-brand dark:text-brand-light">
                            Copied
                          </span>
                        ) : null}
                      </div>
                      {row?.primaryLabel ? (
                        <div className="text-[11px] text-zinc-500 dark:text-zinc-400">Primary source: {row.primaryLabel}</div>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 flex-col items-stretch gap-2 sm:w-52 sm:items-end">
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${badgeClass(health)}`}
                        >
                          {health}
                        </span>
                        {storage !== "arweave" && row != null && row.everlandPinned !== null ? (
                          <span
                            title="4EVERLAND Pinning service (requires saved pin access token)"
                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${everlandPinBadgeClass(row.everlandPinned)}`}
                          >
                            {row.everlandPinned ? "Pinned (4EVER)" : "Unpinned (4EVER)"}
                          </span>
                        ) : null}
                        <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                          {expandedKeys.has(key) ? "Hide raw" : "Show raw"}
                        </span>
                      </div>
                      <FoundationUnlistIfListed
                        contractAddress={nft.contractAddress}
                        tokenId={nft.tokenId}
                        compact
                        className="flex flex-col items-end"
                        providerHeaders={providerHeaders}
                        listedOverride={listedOverride}
                      />
                    </div>
                  </div>
                </summary>
                <div className="mt-4 grid gap-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
                  <div className="space-y-2">
                    <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                      Raw NFT payload
                    </div>
                    <pre className="overflow-auto rounded-lg border border-zinc-200 bg-white p-3 font-mono text-[11px] text-zinc-800 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
                      {rawNft}
                    </pre>
                  </div>
                  <div className="space-y-2">
                    <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                      CID analysis row
                    </div>
                    <pre className="overflow-auto rounded-lg border border-zinc-200 bg-white p-3 font-mono text-[11px] text-zinc-800 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
                      {rawRow ?? "CID analysis runs after NFTs load, or use Analyze CIDs to refresh."}
                    </pre>
                  </div>
                </div>
              </details>
            </li>
          );
        })}
      </ul>
      {lightboxProps ? (
        <NftAssetLightbox
          nft={lightboxProps.nft}
          row={lightboxProps.row}
          previewUrl={lightboxProps.previewUrl}
          displayTitle={lightboxProps.displayTitle}
          health={lightboxProps.health}
          providerHeaders={providerHeaders}
          onClose={() => setLightboxKey(null)}
        />
      ) : null}
    </div>
  );
}
