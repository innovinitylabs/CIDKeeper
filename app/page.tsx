"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { NFTGrid } from "@/app/components/NFTGrid";
import { ProgressBar } from "@/app/components/ProgressBar";
import { WalletInput } from "@/app/components/WalletInput";
import { nftKey } from "@/lib/nft-cids";
import {
  HEADER_ALCHEMY_API_KEY,
  HEADER_WEB3_STORAGE_TOKEN,
  LOCAL_STORAGE_ALCHEMY_KEY,
  LOCAL_STORAGE_WEB3_TOKEN,
} from "@/lib/user-provider-keys";
import type { ExtractedNftRow, NormalizedNft, NftListScope } from "@/types/nft";

const DEFAULT_WALLET = "0x5e051c9106071baF1e4c087e3e06Fdd17396A433";

const SUPPORT_BTC = "bc1qu46qju99mnamq2lw5zqdchddnuulnsq2wegzj0";
const SUPPORT_ETH = "valipokkann.eth";

export default function Home() {
  const [wallet, setWallet] = useState(DEFAULT_WALLET);
  const [nfts, setNfts] = useState<NormalizedNft[]>([]);
  const [rows, setRows] = useState<ExtractedNftRow[] | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set());
  const [banner, setBanner] = useState<string | null>(null);
  const [pinMessage, setPinMessage] = useState<string | null>(null);

  const [phase, setPhase] = useState<"idle" | "nfts" | "extract" | "zip" | "pin">("idle");
  const [progress, setProgress] = useState<number | null>(null);
  const [nftScope, setNftScope] = useState<NftListScope>("created");
  const [includeFactoryCollections, setIncludeFactoryCollections] = useState(true);
  const [supportOpen, setSupportOpen] = useState(false);
  const [supportCopied, setSupportCopied] = useState<string | null>(null);
  const [localAlchemyKey, setLocalAlchemyKey] = useState("");
  const [localWeb3Token, setLocalWeb3Token] = useState("");

  const busy = phase !== "idle";

  useEffect(() => {
    try {
      setLocalAlchemyKey(window.localStorage.getItem(LOCAL_STORAGE_ALCHEMY_KEY) ?? "");
      setLocalWeb3Token(window.localStorage.getItem(LOCAL_STORAGE_WEB3_TOKEN) ?? "");
    } catch {
      // private mode or blocked storage
    }
  }, []);

  const providerHeaders = useMemo(() => {
    const h: Record<string, string> = {};
    const ak = localAlchemyKey.trim();
    const wt = localWeb3Token.trim();
    if (ak) h[HEADER_ALCHEMY_API_KEY] = ak;
    if (wt) h[HEADER_WEB3_STORAGE_TOKEN] = wt;
    return h;
  }, [localAlchemyKey, localWeb3Token]);

  const persistProviderKeys = useCallback(() => {
    try {
      const ak = localAlchemyKey.trim();
      const wt = localWeb3Token.trim();
      if (ak) window.localStorage.setItem(LOCAL_STORAGE_ALCHEMY_KEY, ak);
      else window.localStorage.removeItem(LOCAL_STORAGE_ALCHEMY_KEY);
      if (wt) window.localStorage.setItem(LOCAL_STORAGE_WEB3_TOKEN, wt);
      else window.localStorage.removeItem(LOCAL_STORAGE_WEB3_TOKEN);
      setBanner(null);
    } catch {
      setBanner("Could not save keys in this browser (storage may be blocked).");
    }
  }, [localAlchemyKey, localWeb3Token]);

  const clearProviderKeys = useCallback(() => {
    setLocalAlchemyKey("");
    setLocalWeb3Token("");
    try {
      window.localStorage.removeItem(LOCAL_STORAGE_ALCHEMY_KEY);
      window.localStorage.removeItem(LOCAL_STORAGE_WEB3_TOKEN);
    } catch {
      // ignore
    }
    setBanner(null);
  }, []);

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

  const clearAll = useCallback(() => {
    setWallet("");
    setNfts([]);
    setRows(null);
    setSelectedKeys(new Set());
    setBanner(null);
    setPinMessage(null);
    setPhase("idle");
    setProgress(null);
    setSupportOpen(false);
  }, []);

  const copySupportAddress = useCallback(async (value: string) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setSupportCopied(value);
      window.setTimeout(() => {
        setSupportCopied((current) => (current === value ? null : current));
      }, 1600);
    } catch {
      setSupportCopied(null);
    }
  }, []);

  const runCidAnalysis = useCallback(async (list: NormalizedNft[], options?: { preserveBanner?: boolean }) => {
    if (!list.length) return;
    if (!options?.preserveBanner) {
      setBanner(null);
    }
    setPinMessage(null);
    setPhase("extract");
    setProgress(null);
    try {
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nfts: list }),
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
      const factoryParam =
        nftScope === "created" ? `&includeFactoryCollections=${includeFactoryCollections ? "true" : "false"}` : "";
      const res = await fetch(
        `/api/nfts?owner=${encodeURIComponent(wallet.trim())}&scope=${encodeURIComponent(nftScope)}${factoryParam}`,
        { headers: { ...providerHeaders } },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setBanner(data?.message ?? "Could not load NFTs.");
        return;
      }
      const list = Array.isArray(data.nfts) ? (data.nfts as NormalizedNft[]) : [];
      setNfts(list);
      const keys = list.map((n) => nftKey(n));
      setSelectedKeys(new Set(keys));
      if (list.length > 0) {
        await runCidAnalysis(list, { preserveBanner: true });
      }
      if (Array.isArray(data.pageErrors) && data.pageErrors.length) {
        const partial = `Alchemy returned partial pages: ${data.pageErrors.join("; ")}`;
        setBanner((prev) => (prev ? `${prev} ${partial}` : partial));
      }
    } catch {
      setBanner("Network error while fetching NFTs.");
    } finally {
      setPhase("idle");
      setProgress(null);
    }
  }, [wallet, nftScope, includeFactoryCollections, runCidAnalysis, providerHeaders]);

  const analyze = useCallback(() => runCidAnalysis(nfts), [nfts, runCidAnalysis]);

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
          headers: { "Content-Type": "application/json", ...providerHeaders },
          body: JSON.stringify({
            wallet: w,
            scope: nftScope,
            ...(nftScope === "created" ? { includeFactoryCollections } : {}),
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
    [wallet, selectionPayload, nftScope, includeFactoryCollections, providerHeaders],
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
        headers: { "Content-Type": "application/json", ...providerHeaders },
        body: JSON.stringify({ cids: unique }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 501) {
        setBanner(data?.message ?? "Pinning needs a web3.storage token (your key or server WEB3STORAGE_TOKEN).");
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
  }, [rows, selectionPayload, providerHeaders]);

  return (
    <div className="flex min-h-full flex-1 flex-col bg-zinc-50 dark:bg-zinc-950">
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
          <WalletInput value={wallet} onChange={setWallet} onSubmit={fetchNfts} onClear={clearAll} disabled={busy} />
          <details className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50/80 px-4 py-3 text-sm dark:border-zinc-800 dark:bg-zinc-900/40">
            <summary className="cursor-pointer font-medium text-zinc-800 select-none dark:text-zinc-200">
              Your API keys (optional)
            </summary>
            <p className="mt-3 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
              Keys are kept only in this browser (localStorage on your device). When you load NFTs, export a ZIP, or pin, they
              are sent over HTTPS to this site&apos;s API routes so the server can call Alchemy and web3.storage on your behalf.
              They are not stored in a CIDKeeper database. Anyone who can modify or observe this deployment could in theory
              intercept them, so use provider keys you can rotate and restrict (IP allowlists, usage caps) in the Alchemy and
              web3.storage dashboards.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400">
                <span className="font-medium text-zinc-700 dark:text-zinc-300">Alchemy API key</span>
                <input
                  type="password"
                  autoComplete="off"
                  value={localAlchemyKey}
                  onChange={(e) => setLocalAlchemyKey(e.target.value)}
                  disabled={busy}
                  className="rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-xs text-zinc-900 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
                  placeholder="Needed to list NFTs and for ZIP export"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400">
                <span className="font-medium text-zinc-700 dark:text-zinc-300">web3.storage API token</span>
                <input
                  type="password"
                  autoComplete="off"
                  value={localWeb3Token}
                  onChange={(e) => setLocalWeb3Token(e.target.value)}
                  disabled={busy}
                  className="rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-xs text-zinc-900 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
                  placeholder="Needed for Pin selected"
                />
              </label>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={persistProviderKeys}
                disabled={busy}
                className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                Save to this browser
              </button>
              <button
                type="button"
                onClick={clearProviderKeys}
                disabled={busy}
                className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
              >
                Clear stored keys
              </button>
            </div>
          </details>
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
                    Combines contracts your wallet deployed, Foundation factory-created collections (optional), and
                    transaction-proven mints (ERC721/1155 Transfer from the zero address in txs you sent). Enumerates NFTs
                    from discovered contracts and merges with shared-contract mints. Not ownership-based.
                  </span>
                </span>
              </label>
              {nftScope === "created" ? (
                <label className="ml-6 flex cursor-pointer items-start gap-2 text-zinc-600 dark:text-zinc-400">
                  <input
                    type="checkbox"
                    className="mt-0.5 text-emerald-700 focus:ring-emerald-600"
                    checked={includeFactoryCollections}
                    onChange={(e) => {
                      setIncludeFactoryCollections(e.target.checked);
                      setNfts([]);
                      setRows(null);
                      setSelectedKeys(new Set());
                    }}
                  />
                  <span>
                    <span className="font-medium text-zinc-800 dark:text-zinc-200">Include factory-created collections</span>
                    <span className="block text-xs text-zinc-500 dark:text-zinc-500">
                      When on, scans known Foundation collection factories for txs you sent and adds those collection contracts.
                    </span>
                  </span>
                </label>
              ) : null}
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
              {phase === "nfts" ? (
                <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-500">
                  In progress: waiting on the server for Alchemy; keep this tab open until the list or an error appears.
                </p>
              ) : null}
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

      <footer className="mt-auto border-t border-zinc-200 bg-white/90 px-6 py-6 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90">
        <div className="mx-auto flex max-w-5xl flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Created with love by{" "}
              <a
                href="https://valipokkann.in"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-emerald-700 underline decoration-emerald-700/30 underline-offset-2 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-300"
              >
                Valipokkann
              </a>
            </p>
            <div className="flex items-center gap-1">
              <a
                href="https://x.com/VALIPOKKANN"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                aria-label="Valipokkann on X"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              </a>
              <a
                href="https://www.instagram.com/valipokkann/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                aria-label="Valipokkann on Instagram"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
                  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 11-2.881.001 1.44 1.44 0 012.881-.001z" />
                </svg>
              </a>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSupportOpen(true)}
            className="shrink-0 rounded-lg ring-1 ring-zinc-200/80 transition hover:opacity-95 hover:ring-emerald-500/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 dark:ring-zinc-700"
            aria-label="Open support and donation details"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/support_next.png" alt="Support the next artwork" className="h-11 w-auto sm:h-12" />
          </button>
        </div>
      </footer>

      {supportOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-950/50 p-4 pb-10 sm:items-center sm:pb-4"
          role="presentation"
          onClick={() => setSupportOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="support-dialog-title"
            className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <h2 id="support-dialog-title" className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
                Support CIDKeeper
              </h2>
              <button
                type="button"
                onClick={() => setSupportOpen(false)}
                className="rounded-md px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                aria-label="Close"
              >
                Close
              </button>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
              If this tool saved you time, a donation helps cover hosting and the next artwork. Send any amount to one of the
              addresses below and thank you for using CIDKeeper.
            </p>
            <div className="mt-5 space-y-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Bitcoin</div>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <code className="min-w-0 flex-1 break-all rounded-md bg-zinc-100 px-2 py-1.5 font-mono text-[11px] text-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
                    {SUPPORT_BTC}
                  </code>
                  <button
                    type="button"
                    onClick={() => copySupportAddress(SUPPORT_BTC)}
                    className="shrink-0 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
                  >
                    {supportCopied === SUPPORT_BTC ? "Copied" : "Copy"}
                  </button>
                </div>
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Ethereum</div>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <code className="min-w-0 flex-1 break-all rounded-md bg-zinc-100 px-2 py-1.5 font-mono text-[11px] text-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
                    {SUPPORT_ETH}
                  </code>
                  <button
                    type="button"
                    onClick={() => copySupportAddress(SUPPORT_ETH)}
                    className="shrink-0 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
                  >
                    {supportCopied === SUPPORT_ETH ? "Copied" : "Copy"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
