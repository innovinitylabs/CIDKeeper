import test from "node:test";
import assert from "node:assert/strict";

import { detectPrimaryStorage, extractCidsFromNft } from "@/lib/nft-cids";
import type { NormalizedNft } from "@/types/nft";

test("detectPrimaryStorage reports arweave when metadata points to arweave assets", () => {
  const nft: NormalizedNft = {
    contractAddress: "0xabc0000000000000000000000000000000000001",
    tokenId: "1",
    tokenURI: "https://arweave.net/metadata-1",
    metadata: {
      image: "https://arweave.net/image-1",
      animation_url: "ar://animation-1",
    },
    name: "Arweave NFT",
  };

  assert.deepEqual(extractCidsFromNft(nft), {
    metadataCID: null,
    imageCID: null,
    animationCID: null,
  });
  assert.equal(detectPrimaryStorage(nft), "arweave");
});

test("detectPrimaryStorage prefers ipfs when an IPFS CID exists", () => {
  const nft: NormalizedNft = {
    contractAddress: "0xabc0000000000000000000000000000000000001",
    tokenId: "2",
    tokenURI: "ipfs://bafybeigdyrzt4mw7x2p6jv3n6fhqz7s2m4v2g6m7g6w5k3f2d7m3n2x4yq",
    metadata: {
      image: "https://arweave.net/image-2",
    },
    name: "Hybrid NFT",
  };

  assert.equal(detectPrimaryStorage(nft), "ipfs");
});
