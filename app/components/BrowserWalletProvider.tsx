"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { getInjectedEthereum, type Eip1193Provider } from "@/lib/browser-ethereum";

const MAINNET = "0x1";

type Ctx = {
  provider: Eip1193Provider | null;
  address: string | null;
  chainIdHex: string | null;
  busy: boolean;
  error: string | null;
  connect: () => Promise<string | null>;
  disconnect: () => void;
  refreshChainId: () => Promise<void>;
  switchToEthereumMainnet: () => Promise<boolean>;
};

const BrowserWalletContext = createContext<Ctx | null>(null);

export function BrowserWalletProvider({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const [address, setAddress] = useState<string | null>(null);
  const [chainIdHex, setChainIdHex] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Only true after the user clicks Connect; avoids silent eth_accounts / extension events filling the address. */
  const sessionConnectedRef = useRef(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const provider = mounted ? getInjectedEthereum() : null;

  const refreshChainId = useCallback(async () => {
    const eth = getInjectedEthereum();
    if (!eth) {
      setChainIdHex(null);
      return;
    }
    try {
      const raw = await eth.request({ method: "eth_chainId" });
      setChainIdHex(typeof raw === "string" ? raw.toLowerCase() : null);
    } catch {
      setChainIdHex(null);
    }
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const eth = getInjectedEthereum();
    if (!eth) return;

    void refreshChainId();

    const onAccounts = (accs: unknown) => {
      if (!sessionConnectedRef.current) return;
      if (!Array.isArray(accs) || accs.length === 0) {
        setAddress(null);
        sessionConnectedRef.current = false;
      } else if (typeof accs[0] === "string") {
        setAddress(accs[0]);
      }
    };
    const onChain = () => {
      void refreshChainId();
    };

    eth.on?.("accountsChanged", onAccounts);
    eth.on?.("chainChanged", onChain);
    return () => {
      eth.removeListener?.("accountsChanged", onAccounts);
      eth.removeListener?.("chainChanged", onChain);
    };
  }, [mounted, refreshChainId]);

  const connect = useCallback(async (): Promise<string | null> => {
    const eth = getInjectedEthereum();
    if (!eth) {
      setError("No injected wallet. Install MetaMask (or another wallet) and use a normal browser window (not an embedded preview).");
      return null;
    }

    // Start a wallet prompt in the same synchronous turn as the click (before any setState).
    // MetaMask shows this site as "connected" after account permission is granted; wallet_requestPermissions opens that flow reliably.
    const permissionPromise = eth.request({
      method: "wallet_requestPermissions",
      params: [{ eth_accounts: {} }],
    });

    setBusy(true);
    setError(null);
    try {
      try {
        await permissionPromise;
      } catch (e) {
        const err = e as { code?: number; message?: string };
        if (err.code === 4001) {
          throw e;
        }
        const msg = (err.message ?? "").toLowerCase();
        const maybeUnsupported =
          err.code === -32601 ||
          msg.includes("does not exist") ||
          msg.includes("not supported") ||
          msg.includes("invalid request");
        if (maybeUnsupported) {
          await eth.request({ method: "eth_requestAccounts" });
        } else {
          throw e;
        }
      }

      let raw: unknown = await eth.request({ method: "eth_accounts" });
      if (!Array.isArray(raw) || typeof raw[0] !== "string" || !raw[0]) {
        raw = await eth.request({ method: "eth_requestAccounts" });
      }

      const first = Array.isArray(raw) && typeof raw[0] === "string" ? raw[0] : null;
      sessionConnectedRef.current = first != null;
      setAddress(first);
      await refreshChainId();
      return first;
    } catch (e) {
      const err = e as { code?: number; message?: string };
      if (err.code === 4001) {
        setError("Connection was rejected in the wallet.");
      } else {
        const m = e instanceof Error ? e.message : "Could not connect wallet.";
        setError(m);
      }
      return null;
    } finally {
      setBusy(false);
    }
  }, [refreshChainId]);

  const disconnect = useCallback(() => {
    sessionConnectedRef.current = false;
    setAddress(null);
    setError(null);
  }, []);

  const switchToEthereumMainnet = useCallback(async (): Promise<boolean> => {
    setError(null);
    const eth = getInjectedEthereum();
    if (!eth) {
      setError("No injected wallet.");
      return false;
    }
    setBusy(true);
    try {
      await eth.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: MAINNET }],
      });
      await refreshChainId();
      return true;
    } catch (e) {
      const m = e instanceof Error ? e.message : "Could not switch network.";
      setError(m);
      return false;
    } finally {
      setBusy(false);
    }
  }, [refreshChainId]);

  const value = useMemo(
    () =>
      ({
        provider,
        address,
        chainIdHex,
        busy,
        error,
        connect,
        disconnect,
        refreshChainId,
        switchToEthereumMainnet,
      }) satisfies Ctx,
    [
      provider,
      address,
      chainIdHex,
      busy,
      error,
      connect,
      disconnect,
      refreshChainId,
      switchToEthereumMainnet,
    ],
  );

  return <BrowserWalletContext.Provider value={value}>{children}</BrowserWalletContext.Provider>;
}

export function useBrowserWallet(): Ctx {
  const ctx = useContext(BrowserWalletContext);
  if (!ctx) {
    throw new Error("useBrowserWallet must be used within BrowserWalletProvider");
  }
  return ctx;
}
