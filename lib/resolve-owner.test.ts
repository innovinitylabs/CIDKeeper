import test from "node:test";
import assert from "node:assert/strict";

import { isEnsName, isWalletOrEns } from "@/lib/resolve-owner";

test("isEnsName accepts simple .eth names", () => {
  assert.equal(isEnsName("valipokkann.eth"), true);
  assert.equal(isEnsName("  foo.eth "), true);
});

test("isEnsName accepts subdomains", () => {
  assert.equal(isEnsName("sub.valipokkann.eth"), true);
});

test("isEnsName rejects non-eth and invalid", () => {
  assert.equal(isEnsName("valipokkann.com"), false);
  assert.equal(isEnsName(".eth"), false);
  assert.equal(isEnsName("-bad.eth"), false);
  assert.equal(isEnsName("0x1234567890123456789012345678901234567890"), false);
});

test("isWalletOrEns combines hex and ens", () => {
  assert.equal(isWalletOrEns("0x5e051c9106071baF1e4c087e3e06Fdd17396A433"), true);
  assert.equal(isWalletOrEns("valipokkann.eth"), true);
  assert.equal(isWalletOrEns("not-a-wallet"), false);
});
