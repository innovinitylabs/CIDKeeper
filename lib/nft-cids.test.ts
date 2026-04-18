import test from "node:test";
import assert from "node:assert/strict";

import { detectPrimaryStorage, extractCidsFromNft, previewUrlFromNft } from "@/lib/nft-cids";
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

test("detectPrimaryStorage reports https for third-party image URLs without IPFS CID", () => {
  const nft: NormalizedNft = {
    contractAddress: "0xabc0000000000000000000000000000000000001",
    tokenId: "8",
    tokenURI: null,
    metadata: {
      image: "https://cdn.example.com/nft/42.png",
    },
    name: "Hosted NFT",
  };

  assert.deepEqual(extractCidsFromNft(nft), {
    metadataCID: null,
    imageCID: null,
    animationCID: null,
  });
  assert.equal(detectPrimaryStorage(nft), "https");
});

test("previewUrlFromNft uses metadata image http url when no IPFS CID exists", () => {
  const nft: NormalizedNft = {
    contractAddress: "0xabc0000000000000000000000000000000000001",
    tokenId: "3",
    tokenURI: null,
    metadata: {
      image: {
        url: "https://arweave.net/image-3",
      },
    },
    name: "Preview NFT",
  };

  const cids = extractCidsFromNft(nft);
  assert.equal(previewUrlFromNft(nft, cids), "https://arweave.net/image-3");
});

test("previewUrlFromNft falls back to image_url when image is missing", () => {
  const nft: NormalizedNft = {
    contractAddress: "0xabc0000000000000000000000000000000000001",
    tokenId: "4",
    tokenURI: null,
    metadata: {
      image_url: "https://arweave.net/from-image-url",
    },
    name: "URL NFT",
  };

  const cids = extractCidsFromNft(nft);
  assert.equal(previewUrlFromNft(nft, cids), "https://arweave.net/from-image-url");
});

test("previewUrlFromNft uses metadata CID directory nft.png when metadata has no image", () => {
  const nft: NormalizedNft = {
    contractAddress: "0xabc0000000000000000000000000000000000001",
    tokenId: "5",
    tokenURI: "ipfs://QmQmuu1XntCzy9esPrvvGbBH1HqjRbCQ6fpuJo8WjBWmFQ",
    metadata: { name: "WAY4R" },
    name: "WAY4R",
  };
  const cids = extractCidsFromNft(nft);
  assert.equal(
    previewUrlFromNft(nft, cids),
    "https://ipfs.io/ipfs/QmQmuu1XntCzy9esPrvvGbBH1HqjRbCQ6fpuJo8WjBWmFQ/nft.png",
  );
});

test("previewUrlFromNft preserves ipfs image path (e.g. nft.png under CID)", () => {
  const cid = "QmVRESpBNYgn8jT6qUQQ5ABFQ8rmMCJrBnJ72S1S89VkZm";
  const nft: NormalizedNft = {
    contractAddress: "0xabc0000000000000000000000000000000000001",
    tokenId: "6",
    tokenURI: null,
    metadata: {
      image: `ipfs://${cid}/nft.png`,
    },
    name: "Token",
  };
  const cids = extractCidsFromNft(nft);
  assert.equal(cids.imageCID, cid);
  assert.equal(previewUrlFromNft(nft, cids), `https://ipfs.io/ipfs/${cid}/nft.png`);
});

test("previewUrlFromNft preserves path for https ipfs gateway image urls", () => {
  const cid = "QmVRESpBNYgn8jT6qUQQ5ABFQ8rmMCJrBnJ72S1S89VkZm";
  const nft: NormalizedNft = {
    contractAddress: "0xabc0000000000000000000000000000000000001",
    tokenId: "7",
    tokenURI: null,
    metadata: {
      image: `https://ipfs.io/ipfs/${cid}/nft.png`,
    },
    name: "Token",
  };
  const cids = extractCidsFromNft(nft);
  assert.equal(cids.imageCID, cid);
  assert.equal(previewUrlFromNft(nft, cids), `https://ipfs.io/ipfs/${cid}/nft.png`);
});
