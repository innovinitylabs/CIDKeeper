"use client";

import { useCallback, useMemo, useState } from "react";
import { NFTGrid } from "@/app/components/NFTGrid";
import { ProgressBar } from "@/app/components/ProgressBar";
import { WalletInput } from "@/app/components/WalletInput";
import { nftKey } from "@/lib/nft-cids";
import type { ExtractedNftRow, NormalizedNft, NftListScope } from "@/types/nft";

export default function Home() {
  const [wallet, setWallet] = useState("");
  const [nfts, setNfts] = useState<NormalizedNft[]>([]);
  const [rows, setRows] = useState<ExtractedNftRow[] | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set());
  const [banner, setBanner] = useState<string | null>(null);
  const [pinMessage, setPinMessage] = useState<string | null>(null);

  const [phase, setPhase] = useState<"idle" | "nfts" | "extract" | "zip" | "pin">("idle");
  const [progress, setProgress] = useState<number | null>(null);
  const [nftScope, setNftScope] = useState<NftListScope>("created");

  const busy = phase !== "idle";

  const selectionPayload = useMemo(() => {
    const out: { contract: string; tokenId: string }[] = [];
    for (const nft of nfts) {
      const key = nftKey(nft);
      if (selectedKeys.has(key)) {
        out.push({ contract: nft.contractAddress, tokenId: nft.tokenId });
      }
    }
    return out;
  }, [nfts, selectedKeys]);

  const toggle = useCallback((key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const toggleAll = useCallback((keys: string[], on: boolean) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      for (const k of keys) {
        if (on) next.add(k);
        else next.delete(k);
      }
      return next;
    });
  }, []);

  const fetchNfts = useCallback(async () => {
    setBanner(null);
    setPinMessage(null);
    setRows(null);
    setNfts([]);
    setSelectedKeys(new Set());
    setPhase("nfts");
    setProgress(null);
    try {
      const res = await fetch(
        `/api/nfts?owner=${encodeURIComponent(wallet.trim())}&scope=${encodeURIComponent(nftScope)}`,
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setBanner(data?.message ?? "Could not load NFTs.");
        return;
      }
      const list = Array.isArray(data.nfts) ? (data.nfts as NormalizedNft[]) : [];
      setNfts(list);
      if (Array.isArray(data.pageErrors) && data.pageErrors.length) {
        setBanner(`Alchemy returned partial pages: ${data.pageErrors.join("; ")}`);
      }
      const keys = list.map((n) => nftKey(n));
      setSelectedKeys(new Set(keys));
    } catch {
      setBanner("Network error while fetching NFTs.");
    } finally {
      setPhase("idle");
      setProgress(null);
    }
  }, [wallet, nftScope]);

  const analyze = useCallback(async () => {
    if (!nfts.length) return;
    setBanner(null);
    setPinMessage(null);
    setPhase("extract");
    setProgress(null);
    try {
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nfts }),
      });
      const data = await res.json().catch(() => ({}));
      const nextRows = Array.isArray(data.rows) ? (data.rows as ExtractedNftRow[]) : [];
      setRows(nextRows);
      if (data?.error) {
        setBanner(String(data.message ?? data.error));
      }
    } catch {
      setBanner("Network error during CID analysis.");
    } finally {
      setPhase("idle");
      setProgress(null);
    }
  }, [nfts]);

  const downloadZip = useCallback(
    async (mode: "all" | "selected") => {
      const w = wallet.trim();
      if (!w) {
        setBanner("Enter a wallet first.");
        return;
      }
      setBanner(null);
      setPinMessage(null);
      setPhase("zip");
      setProgress(5);
      try {
        const selection = mode === "selected" ? selectionPayload : undefined;
        if (mode === "selected" && (!selection || selection.length === 0)) {
          setBanner("Select at least one NFT for a partial export.");
          setPhase("idle");
          setProgress(null);
          return;
        }
        setProgress(20);
        const res = await fetch("/api/download", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            wallet: w,
            scope: nftScope,
            ...(selection?.length ? { selection } : {}),
          }),
        });
        setProgress(70);
        if (res.status === 413) {
          const data = await res.json().catch(() => ({}));
          setBanner(data?.message ?? "Too many NFTs for one serverless export.");
          return;
        }
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setBanner(data?.message ?? "ZIP export failed.");
          return;
        }
        const blob = await res.blob();
        setProgress(95);
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `cidkeeper-export.zip`;
        a.click();
        URL.revokeObjectURL(url);
        setProgress(100);
      } catch {
        setBanner("Network error while building the ZIP.");
      } finally {
        setPhase("idle");
        setTimeout(() => setProgress(null), 400);
      }
    },
    [wallet, selectionPayload, nftScope],
  );

  const pinSelected = useCallback(async () => {
    if (!rows?.length) {
      setBanner("Run CID analysis before pinning.");
      return;
    }
    const selectedKeySet = new Set(
      selectionPayload.map((s) => nftKey({ contractAddress: s.contract, tokenId: s.tokenId })),
    );
    const cids = rows.filter((r) => selectedKeySet.has(r.key) && r.primaryCID).map((r) => r.primaryCID as string);
    const unique = [...new Set(cids)];
    if (!unique.length) {
      setBanner("No IPFS CIDs available for the current selection.");
      return;
    }
    setPinMessage(null);
    setPhase("pin");
    setProgress(null);
    try {
      const res = await fetch("/api/pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cids: unique }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 501) {
        setBanner(data?.message ?? "Pinning is not configured (missing WEB3STORAGE_TOKEN).");
        return;
      }
      const results = Array.isArray(data.results) ? data.results : [];
      const ok = results.filter((x: { outputCid?: string | null }) => x.outputCid).length;
      const lines: string[] = [
        `web3.storage upload finished: ${ok}/${results.length} succeeded (re-uploaded bytes; new root CIDs).`,
      ];
      for (const r of results.slice(0, 12) as { inputCid: string; outputCid?: string | null; error?: string | null }[]) {
        lines.push(r.outputCid ? `${r.inputCid} -> ${r.outputCid}` : `${r.inputCid}: ${r.error ?? "failed"}`);
      }
      if (results.length > 12) lines.push(`…and ${results.length - 12} more`);
      setPinMessage(lines.join("\n"));
    } catch {
      setBanner("Network error while pinning.");
    } finally {
      setPhase("idle");
    }
  }, [rows, selectionPayload]);

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-zinc-950">
      <header className="border-b border-zinc-200 bg-white/80 px-6 py-10 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
        <div className="mx-auto flex max-w-5xl flex-col gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700 dark:text-emerald-400">CIDKeeper</p>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Digital asset survival</h1>
          <p className="max-w-2xl text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
            Recover and preserve on-chain media by walking Alchemy metadata, verifying IPFS gateways, downloading exact bytes, and
            exporting a ZIP with a manifest. Optional pinning re-uploads bytes to web3.storage (cannot pin-by-CID alone).
          </p>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-6 py-10">
        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <WalletInput value={wallet} onChange={setWallet} onSubmit={fetchNfts} disabled={busy} />
          <div className="mt-4 flex flex-col gap-3 border-t border-zinc-200 pt-4 text-sm dark:border-zinc-800">
            <span className="font-medium text-zinc-700 dark:text-zinc-200">Wallet inventory</span>
            <div className="flex flex-col gap-2.5">
              <label className="flex cursor-pointer items-start gap-2 text-zinc-600 dark:text-zinc-400">
                <input
                  type="radio"
                  name="nftScope"
                  className="mt-0.5 text-emerald-700 focus:ring-emerald-600"
                  checked={nftScope === "created"}
                  onChange={() => {
                    setNftScope("created");
                    setNfts([]);
                    setRows(null);
                    setSelectedKeys(new Set());
                  }}
                />
                <span>
                  <span className="font-medium text-zinc-800 dark:text-zinc-200">Created by this wallet</span>
                  <span className="block text-xs text-zinc-500 dark:text-zinc-500">
                    Finds contracts deployed by your wallet, keeps only ERC721/ERC1155 collections, then enumerates every NFT
                    in those contracts. This includes items now owned by other wallets too.
                  </span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-2 text-zinc-600 dark:text-zinc-400">
                <input
                  type="radio"
                  name="nftScope"
                  className="mt-0.5 text-emerald-700 focus:ring-emerald-600"
                  checked={nftScope === "owned"}
                  onChange={() => {
                    setNftScope("owned");
                    setNfts([]);
                    setRows(null);
                    setSelectedKeys(new Set());
                  }}
                />
                <span>
                  <span className="font-medium text-zinc-800 dark:text-zinc-200">Owned by this wallet</span>
                  <span className="block text-xs text-zinc-500 dark:text-zinc-500">
                    Current wallet inventory from Alchemy ownership data, including items created by others and items minted on
                    other contracts using your wallet.
                  </span>
                </span>
              </label>
            </div>
          </div>
          {banner ? (
            <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100">
              {banner}
            </p>
          ) : null}
          {pinMessage ? (
            <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 font-mono text-xs text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-100">
              {pinMessage}
            </pre>
          ) : null}
          {phase !== "idle" ? (
            <div className="mt-6">
              <ProgressBar
                label={
                  phase === "nfts"
                    ? nftScope === "created"
                      ? "Fetching deployed NFT contracts and enumerating created items..."
                      : "Fetching current wallet holdings from Alchemy..."
                    : phase === "extract"
                      ? "Checking IPFS gateway health…"
                      : phase === "zip"
                        ? "Building ZIP (exact bytes + manifest)…"
                        : "Pinning via web3.storage…"
                }
                value={progress}
              />
            </div>
          ) : null}
        </section>

        {nfts.length ? (
          <section className="space-y-4">
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={analyze}
                disabled={busy}
                className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 shadow-sm hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
              >
                Analyze CIDs
              </button>
              <button
                type="button"
                onClick={() => downloadZip("all")}
                disabled={busy}
                className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-600 disabled:opacity-50 dark:bg-emerald-600 dark:hover:bg-emerald-500"
              >
                Download all (ZIP)
              </button>
              <button
                type="button"
                onClick={() => downloadZip("selected")}
                disabled={busy}
                className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                Download selected (ZIP)
              </button>
              <button
                type="button"
                onClick={pinSelected}
                disabled={busy}
                className="rounded-lg border border-emerald-600/40 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-900 hover:bg-emerald-100 disabled:opacity-50 dark:bg-emerald-950/40 dark:text-emerald-100 dark:hover:bg-emerald-900/40"
              >
                Pin selected (web3.storage)
              </button>
            </div>
            <p className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
              Vercel serverless exports are size- and time-bounded. If a wallet is large, prefer{" "}
              <span className="font-semibold text-zinc-700 dark:text-zinc-200">Download selected</span> and tune{" "}
              <span className="font-mono">MAX_NFTS_FOR_ZIP</span> only if your deployment can handle heavier workloads.
            </p>
            <NFTGrid nfts={nfts} rows={rows} selectedKeys={selectedKeys} onToggle={toggle} onToggleAll={toggleAll} />
          </section>
        ) : null}
      </main>
    </div>
  );
}
