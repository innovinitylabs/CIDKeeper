import test from "node:test";
import assert from "node:assert/strict";

import {
  collectDeployedContractAddresses,
  filterSupportedCreatedContracts,
  normalizeContractNfts,
} from "@/lib/created-by-wallet";

test("collectDeployedContractAddresses keeps only deployment receipts with contract addresses", () => {
  const transfers = [
    { hash: "0xaaa", to: null },
    { hash: "0xbbb", to: "0x1234" },
    { hash: "0xaaa", to: null },
    { hash: "0xccc", to: null },
  ];

  const receipts = new Map<string, { contractAddress?: string | null } | null>([
    ["0xaaa", { contractAddress: "0xAbC0000000000000000000000000000000000001" }],
    ["0xccc", { contractAddress: null }],
  ]);

  assert.deepEqual(collectDeployedContractAddresses(transfers, receipts), [
    "0xabc0000000000000000000000000000000000001",
  ]);
});

test("filterSupportedCreatedContracts allows trusted addresses when Alchemy deployer is the factory", () => {
  const wallet = "0x9999999999999999999999999999999999999999";
  const trusted = new Set(["0xabc0000000000000000000000000000000000001"]);
  const contracts = [
    {
      address: "0xabc0000000000000000000000000000000000001",
      tokenType: "ERC721",
      contractDeployer: "0x3b612a5b49e025a6e4ba4ee4fb1ef46d13588059",
    },
  ];

  assert.deepEqual(filterSupportedCreatedContracts(wallet, contracts, { trustedAddresses: trusted }), [
    "0xabc0000000000000000000000000000000000001",
  ]);
});

test("filterSupportedCreatedContracts keeps only NFT contracts deployed by the wallet", () => {
  const wallet = "0x9999999999999999999999999999999999999999";
  const contracts = [
    {
      address: "0xabc0000000000000000000000000000000000001",
      tokenType: "ERC721",
      contractDeployer: wallet,
    },
    {
      address: "0xabc0000000000000000000000000000000000002",
      tokenType: "NOT_A_CONTRACT",
      contractDeployer: wallet,
    },
    {
      address: "0xabc0000000000000000000000000000000000003",
      tokenType: "ERC1155",
      contractDeployer: "0x1111111111111111111111111111111111111111",
    },
  ];

  assert.deepEqual(filterSupportedCreatedContracts(wallet, contracts), [
    "0xabc0000000000000000000000000000000000001",
  ]);
});

test("normalizeContractNfts dedupes contract tokens across contract pages", () => {
  const nfts = normalizeContractNfts([
    {
      contract: { address: "0xabc0000000000000000000000000000000000001" },
      tokenId: "1",
      tokenUri: "ipfs://meta-1",
      metadata: { name: "One" },
      name: "One",
    },
    {
      contract: { address: "0xabc0000000000000000000000000000000000001" },
      tokenId: "1",
      tokenURI: "ipfs://meta-1",
      metadata: { name: "One" },
      title: "One",
    },
    {
      contract: { address: "0xabc0000000000000000000000000000000000002" },
      tokenId: "7",
      metadata: { name: "Seven" },
    },
  ]);

  assert.equal(nfts.length, 2);
  assert.deepEqual(
    nfts.map((nft) => ({ contractAddress: nft.contractAddress, tokenId: nft.tokenId })),
    [
      { contractAddress: "0xabc0000000000000000000000000000000000001", tokenId: "1" },
      { contractAddress: "0xabc0000000000000000000000000000000000002", tokenId: "7" },
    ],
  );
});

test("normalizeContractNfts keeps raw tokenUri and raw metadata from contract responses", () => {
  const nfts = normalizeContractNfts([
    {
      contract: { address: "0xabc0000000000000000000000000000000000001" },
      tokenId: "42",
      raw: {
        tokenUri: "ipfs://metadata-42",
        metadata: {
          image: "ipfs://image-42",
          animation_url: "ipfs://anim-42",
          name: "Forty Two",
        },
      },
    },
  ]);

  assert.equal(nfts.length, 1);
  assert.equal(nfts[0]?.tokenURI, "ipfs://metadata-42");
  assert.deepEqual(nfts[0]?.metadata, {
    image: "ipfs://image-42",
    animation_url: "ipfs://anim-42",
    name: "Forty Two",
  });
  assert.equal(nfts[0]?.name, "Forty Two");
});

test("normalizeContractNfts preserves top-level image urls for preview fallback", () => {
  const nfts = normalizeContractNfts([
    {
      contract: { address: "0xabc0000000000000000000000000000000000001" },
      tokenId: "77",
      metadata: {},
      image: {
        originalUrl: "https://arweave.net/image-77",
      },
    },
  ]);

  assert.equal(nfts.length, 1);
  assert.deepEqual(nfts[0]?.metadata, {
    image: "https://arweave.net/image-77",
  });
});
