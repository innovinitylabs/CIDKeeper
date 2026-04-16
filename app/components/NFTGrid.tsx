"use client";

import { useMemo, useState } from "react";
import { NftAssetLightbox } from "@/app/components/NftAssetLightbox";
import { detectPrimaryStorage, extractCidsFromNft, nftKey, previewUrlFromNft } from "@/lib/nft-cids";
import type { ExtractedNftRow, NormalizedNft } from "@/types/nft";

type Props = {
  nfts: NormalizedNft[];
  rows: ExtractedNftRow[] | null;
  selectedKeys: Set<string>;
  onToggle: (key: string) => void;
  onToggleAll: (keys: string[], next: boolean) => void;
};

function badgeClass(health: ExtractedNftRow["health"]) {
  if (health === "alive") return "bg-emerald-500/15 text-emerald-800 ring-emerald-500/30 dark:text-emerald-200 dark:ring-emerald-500/35";
  if (health === "slow") return "bg-amber-500/15 text-amber-900 ring-amber-500/30 dark:text-amber-100";
  if (health === "arweave") return "bg-sky-500/15 text-sky-900 ring-sky-500/30 dark:text-sky-100";
  return "bg-rose-500/15 text-rose-900 ring-rose-500/30 dark:text-rose-100";
}

export function NFTGrid({ nfts, rows, selectedKeys, onToggle, onToggleAll }: Props) {
  const [copiedValue, setCopiedValue] = useState<string | null>(null);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(() => new Set());
  const [lightboxKey, setLightboxKey] = useState<string | null>(null);
  const rowByKey = new Map<string, ExtractedNftRow>();
  if (rows) for (const r of rows) rowByKey.set(r.key, r);

  const keys = nfts.map((n) => nftKey(n));
  const allSelected = keys.length > 0 && keys.every((k) => selectedKeys.has(k));

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
    const storage = detectPrimaryStorage(nft);
    const health = row?.health ?? (storage === "arweave" ? "arweave" : "dead");
    return { nft, row, previewUrl, displayTitle: title, health };
  }, [lightboxKey, nfts, rows]);

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <div className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">Collection</div>
        <label className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={(e) => onToggleAll(keys, e.target.checked)}
            className="rounded border-zinc-300 text-brand focus:ring-brand dark:border-zinc-600"
          />
          Select all
        </label>
      </div>
      <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
        {nfts.map((nft) => {
          const key = nftKey(nft);
          const row = rowByKey.get(key);
          const title = row?.name ?? nft.name ?? `Token ${nft.tokenId}`;
          const cid = row?.primaryCID ?? "—";
          const storage = detectPrimaryStorage(nft);
          const health = row?.health ?? (storage === "arweave" ? "arweave" : "dead");
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
                    <div className="flex shrink-0 items-center gap-2 sm:w-44 sm:justify-end">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${badgeClass(health)}`}
                      >
                        {health}
                      </span>
                      <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                        {expandedKeys.has(key) ? "Hide raw" : "Show raw"}
                      </span>
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
          onClose={() => setLightboxKey(null)}
        />
      ) : null}
    </div>
  );
}
