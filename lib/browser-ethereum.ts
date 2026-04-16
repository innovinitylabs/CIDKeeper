export type Eip1193Provider = {
  request: (args: { method: string; params?: readonly unknown[] }) => Promise<unknown>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
};

type InjectedFlags = {
  providers?: readonly Eip1193Provider[];
  isMetaMask?: boolean;
  isCoinbaseWallet?: boolean;
  isBraveWallet?: boolean;
};

function pickFromProviders(list: readonly Eip1193Provider[]): Eip1193Provider | null {
  if (!list.length) return null;
  const metaMask = list.find((p) => {
    const f = p as InjectedFlags;
    return f.isMetaMask === true && f.isCoinbaseWallet !== true;
  });
  if (metaMask) return metaMask;
  return list[0] ?? null;
}

/**
 * EIP-1193 provider for `eth_requestAccounts` / `eth_sendTransaction`.
 * When several wallets inject `ethereum.providers`, prefers MetaMask so Connect opens the expected extension.
 */
export function getInjectedEthereum(): Eip1193Provider | null {
  if (typeof window === "undefined") return null;
  const root = (window as Window & { ethereum?: Eip1193Provider & InjectedFlags }).ethereum;
  if (!root) return null;
  const list = root.providers;
  if (Array.isArray(list) && list.length > 0) {
    const picked = pickFromProviders(list);
    if (picked) return picked;
  }
  return root;
}
