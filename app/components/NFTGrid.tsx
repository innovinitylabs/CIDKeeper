"use client";

import { nftKey } from "@/lib/nft-cids";
import type { ExtractedNftRow, NormalizedNft } from "@/types/nft";

type Props = {
  nfts: NormalizedNft[];
  rows: ExtractedNftRow[] | null;
  selectedKeys: Set<string>;
  onToggle: (key: string) => void;
  onToggleAll: (keys: string[], next: boolean) => void;
};

function badgeClass(health: ExtractedNftRow["health"]) {
  if (health === "alive") return "bg-emerald-500/15 text-emerald-800 ring-emerald-500/30 dark:text-emerald-200";
  if (health === "slow") return "bg-amber-500/15 text-amber-900 ring-amber-500/30 dark:text-amber-100";
  return "bg-rose-500/15 text-rose-900 ring-rose-500/30 dark:text-rose-100";
}

export function NFTGrid({ nfts, rows, selectedKeys, onToggle, onToggleAll }: Props) {
  const rowByKey = new Map<string, ExtractedNftRow>();
  if (rows) for (const r of rows) rowByKey.set(r.key, r);

  const keys = nfts.map((n) => nftKey(n));
  const allSelected = keys.length > 0 && keys.every((k) => selectedKeys.has(k));

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <div className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">Collection</div>
        <label className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={(e) => onToggleAll(keys, e.target.checked)}
            className="rounded border-zinc-300 text-emerald-700 focus:ring-emerald-600 dark:border-zinc-600"
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
          const health = row?.health ?? "dead";

          return (
            <li key={key} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
              <div className="flex items-start gap-3 sm:w-72">
                <input
                  type="checkbox"
                  checked={selectedKeys.has(key)}
                  onChange={() => onToggle(key)}
                  className="mt-1 rounded border-zinc-300 text-emerald-700 focus:ring-emerald-600 dark:border-zinc-600"
                />
                <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900">
                  {row?.previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={row.previewUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-[10px] text-zinc-400">No preview</div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-50">{title}</div>
                  <div className="truncate font-mono text-[11px] text-zinc-500 dark:text-zinc-400">{nft.contractAddress}</div>
                </div>
              </div>
              <div className="min-w-0 flex-1 space-y-1 sm:pl-2">
                <div className="font-mono text-xs text-zinc-700 dark:text-zinc-200">
                  <span className="text-zinc-500 dark:text-zinc-500">CID </span>
                  <span className="break-all">{cid}</span>
                </div>
                {row?.primaryLabel ? (
                  <div className="text-[11px] text-zinc-500 dark:text-zinc-400">Primary source: {row.primaryLabel}</div>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-2 sm:w-40 sm:justify-end">
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${badgeClass(health)}`}
                >
                  {health}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
