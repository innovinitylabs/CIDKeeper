import test from "node:test";
import assert from "node:assert/strict";

import {
  extractFoundationFactoryCollectionAddresses,
  FOUNDATION_FACTORIES,
  LEGACY_COLLECTION_CREATED_TOPIC,
  NFT_COLLECTION_CREATED_TOPIC,
  NFT_DROP_COLLECTION_CREATED_TOPIC,
} from "@/lib/foundation-factory";

const FACTORY = FOUNDATION_FACTORIES[0].toLowerCase();
const WALLET = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function padAddr(addr: string): string {
  const a = addr.toLowerCase().replace(/^0x/, "");
  return "0x" + a.padStart(64, "0");
}

test("extractFoundationFactoryCollectionAddresses reads legacy CollectionCreated (2022 factory)", () => {
  const wallet = "0x5e051c9106071baf1e4c087e3e06fdd17396a433";
  const collection = "0xfae047fff8d0c55f31dd2c7f4641f51e49677419";
  const logs = [
    {
      address: FACTORY,
      topics: [LEGACY_COLLECTION_CREATED_TOPIC, padAddr(collection), padAddr(wallet), padAddr("0x1")],
      data: "0x",
    },
  ];
  const out = extractFoundationFactoryCollectionAddresses(logs, wallet.toLowerCase());
  assert.deepEqual(out, [collection.toLowerCase()]);
});

test("extractFoundationFactoryCollectionAddresses reads NFTCollectionCreated", () => {
  const collection = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
  const logs = [
    {
      address: FACTORY,
      topics: [NFT_COLLECTION_CREATED_TOPIC, padAddr(collection), padAddr(WALLET), padAddr("0x1")],
      data: "0x",
    },
  ];
  const out = extractFoundationFactoryCollectionAddresses(logs, WALLET);
  assert.deepEqual(out, [collection.toLowerCase()]);
});

test("extractFoundationFactoryCollectionAddresses reads NFTDropCollectionCreated", () => {
  const collection = "0xcccccccccccccccccccccccccccccccccccccccc";
  const minter = "0xdddddddddddddddddddddddddddddddddddddddd";
  const logs = [
    {
      address: FACTORY,
      topics: [NFT_DROP_COLLECTION_CREATED_TOPIC, padAddr(collection), padAddr(WALLET), padAddr(minter)],
      data: "0x",
    },
  ];
  const out = extractFoundationFactoryCollectionAddresses(logs, WALLET);
  assert.deepEqual(out, [collection.toLowerCase()]);
});

test("extractFoundationFactoryCollectionAddresses ignores other creator", () => {
  const collection = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
  const other = "0xffffffffffffffffffffffffffffffffffffffff";
  const logs = [
    {
      address: FACTORY,
      topics: [NFT_COLLECTION_CREATED_TOPIC, padAddr(collection), padAddr(other), padAddr("0x1")],
      data: "0x",
    },
  ];
  const out = extractFoundationFactoryCollectionAddresses(logs, WALLET);
  assert.deepEqual(out, []);
});

test("extractFoundationFactoryCollectionAddresses ignores non-factory log address", () => {
  const collection = "0x1111111111111111111111111111111111111111";
  const logs = [
    {
      address: "0x2222222222222222222222222222222222222222",
      topics: [NFT_COLLECTION_CREATED_TOPIC, padAddr(collection), padAddr(WALLET), padAddr("0x1")],
      data: "0x",
    },
  ];
  const out = extractFoundationFactoryCollectionAddresses(logs, WALLET);
  assert.deepEqual(out, []);
});

test("extractFoundationFactoryCollectionAddresses honors custom factory address set", () => {
  const customFactory = "0x3333333333333333333333333333333333333333";
  const collection = "0x4444444444444444444444444444444444444444";
  const logs = [
    {
      address: customFactory,
      topics: [NFT_COLLECTION_CREATED_TOPIC, padAddr(collection), padAddr(WALLET), padAddr("0x1")],
      data: "0x",
    },
  ];
  const allow = new Set([customFactory.toLowerCase()]);
  const out = extractFoundationFactoryCollectionAddresses(logs, WALLET, allow);
  assert.deepEqual(out, [collection.toLowerCase()]);
});
