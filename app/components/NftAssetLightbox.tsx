"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { ExtractedNftRow, NormalizedNft } from "@/types/nft";

type TraitRow = { trait: string; value: string };

function lightboxBadgeClass(health: ExtractedNftRow["health"]) {
  if (health === "alive") return "bg-emerald-500/15 text-emerald-800 ring-emerald-500/30 dark:text-emerald-200 dark:ring-emerald-500/35";
  if (health === "slow") return "bg-amber-500/15 text-amber-900 ring-amber-500/30 dark:text-amber-100";
  if (health === "arweave") return "bg-sky-500/15 text-sky-900 ring-sky-500/30 dark:text-sky-100";
  return "bg-rose-500/15 text-rose-900 ring-rose-500/30 dark:text-rose-100";
}

function pickMetadataDescription(metadata: Record<string, unknown> | null): string | null {
  if (!metadata) return null;
  const d = metadata.description;
  if (typeof d === "string" && d.trim()) return d.trim();
  return null;
}

function pickMetadataAttributes(metadata: Record<string, unknown> | null): TraitRow[] {
  if (!metadata) return [];
  const raw = metadata.attributes;
  if (!Array.isArray(raw)) return [];
  const out: TraitRow[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const trait =
      typeof o.trait_type === "string"
        ? o.trait_type
        : typeof o.traitType === "string"
          ? o.traitType
          : "";
    let value: string;
    if (typeof o.value === "string" || typeof o.value === "number") {
      value = String(o.value);
    } else {
      continue;
    }
    if (!trait && !value) continue;
    out.push({ trait: trait || "—", value });
  }
  return out;
}

function isOpenableImageUrl(url: string | null): boolean {
  if (!url || url === "—") return false;
  return /^https?:\/\//i.test(url) || url.startsWith("blob:");
}

const ZOOM_MIN = 1;
const ZOOM_MAX = 4;
const ZOOM_STEP = 0.25;

type Props = {
  nft: NormalizedNft;
  row: ExtractedNftRow | undefined;
  previewUrl: string | null;
  displayTitle: string;
  health: ExtractedNftRow["health"];
  onClose: () => void;
};

export function NftAssetLightbox({ nft, row, previewUrl, displayTitle, health, onClose }: Props) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  const description = pickMetadataDescription(nft.metadata);
  const traits = pickMetadataAttributes(nft.metadata);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const zoomIn = useCallback(() => {
    setScale((s) => Math.min(ZOOM_MAX, Math.round((s + ZOOM_STEP) * 100) / 100));
  }, []);

  const zoomOut = useCallback(() => {
    setScale((s) => Math.max(ZOOM_MIN, Math.round((s - ZOOM_STEP) * 100) / 100));
  }, []);

  const zoomReset = useCallback(() => setScale(1), []);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    function onWheelNative(e: WheelEvent) {
      const stage = stageRef.current;
      if (!stage || !stage.contains(e.target as Node)) return;
      e.preventDefault();
      if (e.deltaY < 0) zoomIn();
      else zoomOut();
    }
    el.addEventListener("wheel", onWheelNative, { passive: false });
    return () => el.removeEventListener("wheel", onWheelNative);
  }, [zoomIn, zoomOut]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-stretch justify-center bg-zinc-950/75 p-0 sm:p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex h-full max-h-full w-full max-w-6xl flex-col overflow-hidden rounded-none border-0 bg-white shadow-2xl sm:max-h-[min(100dvh,920px)] sm:rounded-2xl sm:border sm:border-zinc-200 dark:bg-zinc-900 dark:sm:border-zinc-700"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <h2 id={titleId} className="min-w-0 truncate text-base font-semibold text-zinc-900 dark:text-zinc-50">
            {displayTitle}
          </h2>
          <div className="flex shrink-0 items-center gap-2">
            {previewUrl && isOpenableImageUrl(previewUrl) ? (
              <a
                href={previewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="hidden rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-800 hover:bg-zinc-50 sm:inline-block dark:border-zinc-600 dark:text-zinc-100 dark:hover:bg-zinc-800"
              >
                Open image
              </a>
            ) : null}
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
            >
              Close
            </button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col border-b border-zinc-200 dark:border-zinc-800 lg:border-b-0 lg:border-r">
            <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-zinc-100 px-3 py-2 dark:border-zinc-800">
              <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Zoom</span>
              <button
                type="button"
                onClick={zoomOut}
                disabled={scale <= ZOOM_MIN}
                className="rounded-md border border-zinc-300 px-2 py-1 text-xs font-semibold text-zinc-800 disabled:opacity-40 dark:border-zinc-600 dark:text-zinc-100"
              >
                −
              </button>
              <button
                type="button"
                onClick={zoomReset}
                className="rounded-md border border-zinc-300 px-2 py-1 text-xs font-semibold text-zinc-800 dark:border-zinc-600 dark:text-zinc-100"
              >
                Reset
              </button>
              <button
                type="button"
                onClick={zoomIn}
                disabled={scale >= ZOOM_MAX}
                className="rounded-md border border-zinc-300 px-2 py-1 text-xs font-semibold text-zinc-800 disabled:opacity-40 dark:border-zinc-600 dark:text-zinc-100"
              >
                +
              </button>
              <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400">{Math.round(scale * 100)}%</span>
            </div>
            <div ref={stageRef} className="min-h-[40vh] flex-1 overflow-auto bg-zinc-100 dark:bg-zinc-950">
              <div className="flex min-h-full min-w-full items-center justify-center p-4">
                {previewUrl ? (
                  <div
                    style={{ transform: `scale(${scale})`, transformOrigin: "center center" }}
                    className="transition-transform duration-150 ease-out"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={previewUrl}
                      alt=""
                      className="max-h-[min(70vh,640px)] max-w-full object-contain"
                      draggable={false}
                    />
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-zinc-300 px-6 py-12 text-center text-sm text-zinc-500 dark:border-zinc-600 dark:text-zinc-400">
                    No preview image URL for this token.
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex max-h-[45vh] w-full shrink-0 flex-col overflow-y-auto lg:max-h-none lg:w-[min(100%,380px)] lg:shrink">
            <div className="space-y-4 p-4 text-sm text-zinc-700 dark:text-zinc-300">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${lightboxBadgeClass(health)}`}
                >
                  {health}
                </span>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">Token #{nft.tokenId}</span>
              </div>

              {description ? (
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    Description
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-zinc-800 dark:text-zinc-200">
                    {description}
                  </p>
                </div>
              ) : null}

              {traits.length > 0 ? (
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    Attributes
                  </div>
                  <ul className="mt-2 divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-700 dark:border-zinc-700">
                    {traits.map((t, i) => (
                      <li key={`${t.trait}-${i}`} className="flex justify-between gap-3 px-3 py-2 text-xs">
                        <span className="font-medium text-zinc-600 dark:text-zinc-400">{t.trait}</span>
                        <span className="min-w-0 break-all text-right text-zinc-900 dark:text-zinc-100">{t.value}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  Contract
                </div>
                <p className="mt-1 break-all font-mono text-xs text-zinc-900 dark:text-zinc-100">{nft.contractAddress}</p>
              </div>

              {nft.tokenURI ? (
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    Token URI
                  </div>
                  <a
                    href={nft.tokenURI}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 block break-all text-xs font-medium text-brand underline decoration-brand/30 underline-offset-2 hover:text-brand-hover dark:text-brand-light"
                  >
                    {nft.tokenURI}
                  </a>
                </div>
              ) : null}

              {row ? (
                <div className="space-y-2 border-t border-zinc-200 pt-3 dark:border-zinc-700">
                  <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    CID analysis
                  </div>
                  <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                    <dt className="text-zinc-500 dark:text-zinc-400">Primary</dt>
                    <dd className="break-all font-mono text-zinc-900 dark:text-zinc-100">{row.primaryCID ?? "—"}</dd>
                    <dt className="text-zinc-500 dark:text-zinc-400">Metadata</dt>
                    <dd className="break-all font-mono text-zinc-900 dark:text-zinc-100">{row.metadataCID ?? "—"}</dd>
                    <dt className="text-zinc-500 dark:text-zinc-400">Image</dt>
                    <dd className="break-all font-mono text-zinc-900 dark:text-zinc-100">{row.imageCID ?? "—"}</dd>
                    <dt className="text-zinc-500 dark:text-zinc-400">Animation</dt>
                    <dd className="break-all font-mono text-zinc-900 dark:text-zinc-100">{row.animationCID ?? "—"}</dd>
                    {row.primaryLabel ? (
                      <>
                        <dt className="text-zinc-500 dark:text-zinc-400">Source</dt>
                        <dd className="text-zinc-900 dark:text-zinc-100">{row.primaryLabel}</dd>
                      </>
                    ) : null}
                    {row.healthMs != null ? (
                      <>
                        <dt className="text-zinc-500 dark:text-zinc-400">Latency</dt>
                        <dd className="text-zinc-900 dark:text-zinc-100">{row.healthMs} ms</dd>
                      </>
                    ) : null}
                  </dl>
                  {row.errors.length > 0 ? (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100">
                      {row.errors.join("; ")}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
