"use client";

import { useBrowserWallet } from "@/app/components/BrowserWalletProvider";

function shortAddr(a: string): string {
  if (a.length < 12) return a;
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export function BrowserWalletBar() {
  const {
    provider,
    address,
    chainIdHex,
    busy,
    error,
    connect,
    disconnect,
    switchToEthereumMainnet,
  } = useBrowserWallet();

  const onMainnet = chainIdHex === "0x1";

  return (
    <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50/90 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-900/50">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Browser wallet
          </p>
          <p className="mt-1 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
            The site does not auto-connect your wallet. Loading NFTs and analyzing CIDs work without a wallet; connect
            only when you want to send a transaction, such as unlisting on Foundation.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          {!provider ? (
            <span className="text-xs font-medium text-amber-800 dark:text-amber-200">
              No wallet extension detected.
            </span>
          ) : address ? (
            <>
              <span className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 font-mono text-xs text-zinc-900 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100">
                {shortAddr(address)}
              </span>
              {!onMainnet ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void switchToEthereumMainnet()}
                  className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
                >
                  Use Ethereum mainnet
                </button>
              ) : (
                <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">Ethereum mainnet</span>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={disconnect}
                className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                Forget in app
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={busy || !provider}
              onClick={(e) => {
                e.preventDefault();
                void connect();
              }}
              className="rounded-lg bg-zinc-900 px-4 py-2 text-xs font-semibold text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              {busy ? "Connecting…" : "Connect wallet"}
            </button>
          )}
        </div>
      </div>
      {error ? (
        <p className="mt-2 text-xs font-medium text-rose-700 dark:text-rose-300">{error}</p>
      ) : null}
      {!error && provider && !address ? (
        <p className="mt-2 text-[10px] leading-relaxed text-zinc-500 dark:text-zinc-400">
          {`MetaMask shows "Not connected" until you approve here.`} Allow pop-ups for this origin, use Chrome or Firefox (not an
          in-editor browser), and disable other extensions that replace{" "}
          <span className="font-mono">window.ethereum</span> before MetaMask.
        </p>
      ) : null}
    </div>
  );
}
