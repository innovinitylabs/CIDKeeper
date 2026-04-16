import test from "node:test";
import assert from "node:assert/strict";

import { shouldFetchCreatorMintReceipt } from "@/lib/minted-by-wallet";
import { FOUNDATION_FACTORIES, mergeFoundationFactorySet } from "@/lib/foundation-factory";

const SEAPORT_15 = "0x00000000000000ADc04C56Bf30AC9d3c0aAF14DC6".toLowerCase();

test("shouldFetchCreatorMintReceipt is true when indexed Transfer has from zero", () => {
  assert.equal(
    shouldFetchCreatorMintReceipt("0xdead000000000000000000000000000000000001", [], true, new Set(), new Set()),
    true,
  );
});

test("shouldFetchCreatorMintReceipt is true for Foundation factory tx.to", () => {
  assert.equal(
    shouldFetchCreatorMintReceipt(FOUNDATION_FACTORIES[0].toLowerCase(), [], false, new Set(), new Set()),
    true,
  );
});

test("shouldFetchCreatorMintReceipt is true for an extra factory when merged factory set is passed", () => {
  const custom = "0x3333333333333333333333333333333333333333";
  const set = mergeFoundationFactorySet([custom]);
  assert.equal(shouldFetchCreatorMintReceipt(custom.toLowerCase(), [], false, new Set(), new Set(), set), true);
});

test("shouldFetchCreatorMintReceipt is true when tx.to is enumerated NFT contract", () => {
  const nft = "0xabc0000000000000000000000000000000000001";
  assert.equal(shouldFetchCreatorMintReceipt(nft, [], false, new Set([nft]), new Set()), true);
});

test("shouldFetchCreatorMintReceipt is true when tx.to matches raw NFT contract in the tx", () => {
  const nft = "0xdef0000000000000000000000000000000000001";
  assert.equal(shouldFetchCreatorMintReceipt(nft, [nft], false, new Set(), new Set()), true);
});

test("shouldFetchCreatorMintReceipt is true for known marketplace delegate", () => {
  assert.equal(
    shouldFetchCreatorMintReceipt(SEAPORT_15, [], false, new Set(), new Set([SEAPORT_15])),
    true,
  );
});

test("shouldFetchCreatorMintReceipt skips unrelated tx.to when no mint-from-zero in index", () => {
  assert.equal(
    shouldFetchCreatorMintReceipt("0x1111111111111111111111111111111111111111", ["0x2222222222222222222222222222222222222222"], false, new Set(), new Set()),
    false,
  );
});
