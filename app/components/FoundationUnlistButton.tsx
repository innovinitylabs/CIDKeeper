"use client";

import { useCallback, useState } from "react";
import { useBrowserWallet } from "@/app/components/BrowserWalletProvider";
import { isEthereumAddress } from "@/lib/address";
import { getInjectedEthereum } from "@/lib/browser-ethereum";
import {
  decodeErc721OwnerOfResult,
  encodeErc721OwnerOfCalldata,
  encodeFoundationClearListingCalldata,
  FOUNDATION_ETH_MAINNET_NFT_MARKET,
  foundationMarketEscrowAddressesForHelpText,
  isLikelyFoundationMarketEscrow,
} from "@/lib/foundation-unlist";

const MAINNET_CHAIN_ID_HEX = "0x1";

export function parseNftTokenIdToBigInt(tokenId: string): bigint | null {
  const t = tokenId.trim();
  if (!t) return null;
  try {
    if (/^0x[0-9a-fA-F]+$/.test(t)) return BigInt(t);
    if (/^\d+$/.test(t)) return BigInt(t);
    return null;
  } catch {
    return null;
  }
}

type Props = {
  contractAddress: string;
  tokenId: string;
  /** Shorter label for tight grid rows */
  compact?: boolean;
  className?: string;
};

export function FoundationUnlistButton({ contractAddress, tokenId, compact, className }: Props) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const { address, switchToEthereumMainnet } = useBrowserWallet();

  const onUnlist = useCallback(async () => {
    setMsg(null);
    const addr = contractAddress.trim();
    if (!isEthereumAddress(addr)) {
      setMsg("Invalid NFT contract address.");
      return;
    }
    const tid = parseNftTokenIdToBigInt(tokenId);
    if (tid === null) {
      setMsg("Invalid token id.");
      return;
    }

    const eth = getInjectedEthereum();
    if (!eth) {
      setMsg("No browser wallet found (install MetaMask or another EIP-1193 wallet).");
      return;
    }

    if (!address) {
      setMsg("Connect your wallet with the Connect wallet button above, then try Unlist again.");
      return;
    }
    const from = address;

    setBusy(true);
    try {
      const chainIdRaw = await eth.request({ method: "eth_chainId" });
      const chainId = typeof chainIdRaw === "string" ? chainIdRaw.toLowerCase() : "";
      if (chainId !== MAINNET_CHAIN_ID_HEX) {
        const switched = await switchToEthereumMainnet();
        if (!switched) {
          setMsg("Switch your wallet to Ethereum mainnet, then try again.");
          return;
        }
        const again = await eth.request({ method: "eth_chainId" });
        const againHex = typeof again === "string" ? again.toLowerCase() : "";
        if (againHex !== MAINNET_CHAIN_ID_HEX) {
          setMsg("Switch your wallet to Ethereum mainnet, then try again.");
          return;
        }
      }

      let ownerRaw: unknown;
      try {
        ownerRaw = await eth.request({
          method: "eth_call",
          params: [{ to: addr.toLowerCase(), data: encodeErc721OwnerOfCalldata(tid) }, "latest"],
        });
      } catch {
        setMsg(
          "Could not read token owner on-chain (wrong contract, burned token, or RPC error). Check the contract and token id.",
        );
        return;
      }

      if (typeof ownerRaw !== "string" || !ownerRaw.startsWith("0x")) {
        setMsg("Unexpected response while reading token owner.");
        return;
      }

      const tokenOwner = decodeErc721OwnerOfResult(ownerRaw as `0x${string}`);
      if (!isLikelyFoundationMarketEscrow(tokenOwner)) {
        setMsg(
          `Preflight: this token is not held by a known Foundation market escrow (${foundationMarketEscrowAddressesForHelpText()}). Current owner: ${tokenOwner}. If you already unlisted, nothing else is needed. If it should still be listed, finish on https://foundation.app/.`,
        );
        return;
      }

    } catch (e) {
      const m = e instanceof Error ? e.message : "Preflight failed.";
      setMsg(m);
      return;
    } finally {
      setBusy(false);
    }

    const ok = window.confirm(
      "Send one Ethereum mainnet transaction to the Foundation market contract to clear this listing? On-chain owner is the market escrow; your wallet will run its own simulation. You pay gas.",
    );
    if (!ok) return;

    setBusy(true);
    try {
      const data = encodeFoundationClearListingCalldata(addr.toLowerCase() as `0x${string}`, tid);
      let ownerRecheck: unknown;
      try {
        ownerRecheck = await eth.request({
          method: "eth_call",
          params: [{ to: addr.toLowerCase(), data: encodeErc721OwnerOfCalldata(tid) }, "latest"],
        });
      } catch {
        setMsg("Could not re-check token owner before sending.");
        return;
      }
      if (typeof ownerRecheck !== "string" || !ownerRecheck.startsWith("0x")) {
        setMsg("Unexpected owner response before send.");
        return;
      }
      const ownerAfter = decodeErc721OwnerOfResult(ownerRecheck as `0x${string}`) as `0x${string}`;
      if (!isLikelyFoundationMarketEscrow(ownerAfter)) {
        setMsg("Token owner changed; refresh the page and try again.");
        return;
      }

      const txTo = FOUNDATION_ETH_MAINNET_NFT_MARKET as `0x${string}`;

      const txHash = await eth.request({
        method: "eth_sendTransaction",
        params: [
          {
            from,
            to: txTo,
            data,
          },
        ],
      });

      if (typeof txHash === "string" && txHash.startsWith("0x")) {
        setMsg(
          `Submitted ${txHash.slice(0, 10)}... View on Etherscan: https://etherscan.io/tx/${txHash}`,
        );
      } else {
        setMsg("Transaction submitted.");
      }
    } catch (e) {
      const m = e instanceof Error ? e.message : "Wallet request failed.";
      setMsg(m);
    } finally {
      setBusy(false);
    }
  }, [address, contractAddress, switchToEthereumMainnet, tokenId]);

  return (
    <div className={className ?? ""} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        disabled={busy}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          void onUnlist();
        }}
        title="Clears a Foundation.market listing on Ethereum mainnet (zero reserve, duration, and buy fields). Only works if this token is listed there."
        className="rounded-lg border border-zinc-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
      >
        {busy ? "Wallet…" : compact ? "Unlist (Foundation)" : "Unlist on Foundation"}
      </button>
      {msg ? (
        <p className="mt-1 max-w-[280px] text-[10px] leading-snug text-zinc-600 dark:text-zinc-400">{msg}</p>
      ) : null}
    </div>
  );
}
