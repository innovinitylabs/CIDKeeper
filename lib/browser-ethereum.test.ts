import test from "node:test";
import assert from "node:assert/strict";

test("pickFromProviders prefers MetaMask over first entry when both exist", async () => {
  const { getInjectedEthereum } = await import("@/lib/browser-ethereum");

  const coinbase = {
    isCoinbaseWallet: true,
    isMetaMask: false,
    request: async () => null,
  };
  const metamask = {
    isMetaMask: true,
    isCoinbaseWallet: false,
    request: async () => null,
  };

  (globalThis as unknown as { window: unknown }).window = {
    ethereum: {
      providers: [coinbase, metamask],
      request: async () => null,
    },
  };

  const p = getInjectedEthereum();
  assert.ok(p);
  assert.equal((p as { isMetaMask?: boolean }).isMetaMask, true);
});
