import {
  concat,
  decodeFunctionResult,
  encodeAbiParameters,
  encodeFunctionData,
  parseAbiItem,
  parseAbiParameters,
} from "viem";

/**
 * Foundation NFT market proxy on Ethereum mainnet used for `upsertListing` / clear listing (`tx.to`).
 * @see https://etherscan.io/address/0x762340b8a40cdd5bfc3edd94265899fda345d0e3
 */
export const FOUNDATION_ETH_MAINNET_NFT_MARKET = "0x762340b8a40cdd5bfc3edd94265899fda345d0e3" as const;

/**
 * Older market proxy; some ERC-721 `ownerOf` values may still point here while listed. Listing txs are sent to
 * FOUNDATION_ETH_MAINNET_NFT_MARKET per current Foundation behavior.
 * @see https://etherscan.io/address/0xcda72070e455bb31c7690a170224ce43623d0b6f
 */
export const FOUNDATION_ETH_MAINNET_NFT_MARKET_LEGACY = "0xcda72070e455bb31c7690a170224ce43623d0b6f" as const;

const FOUNDATION_MARKET_ESCROW_LOWERS = new Set(
  [FOUNDATION_ETH_MAINNET_NFT_MARKET, FOUNDATION_ETH_MAINNET_NFT_MARKET_LEGACY].map((a) => a.toLowerCase()),
);

/**
 * Clears an active listing by zeroing reserve/auction/buy fields and an empty world-association tuple.
 * Block explorers often label this `upsertListing`; the selector is verified against mainnet calldata.
 */
export const FOUNDATION_CLEAR_LISTING_SELECTOR = "0x23dc8658" as const;

const clearListingParams = parseAbiParameters(
  "address nftContract, uint256 tokenId, uint256 reservePrice, uint256 auctionDuration, bool shouldSetBuyPrice, uint256 buyPrice, uint256 saleStartsAt, (uint256,uint256,bytes) worldAssociation",
);

export function encodeFoundationClearListingCalldata(
  nftContract: `0x${string}`,
  tokenId: bigint,
): `0x${string}` {
  const z = BigInt(0);
  const body = encodeAbiParameters(clearListingParams, [
    nftContract,
    tokenId,
    z,
    z,
    false,
    z,
    z,
    [z, z, "0x"],
  ]);
  return concat([FOUNDATION_CLEAR_LISTING_SELECTOR, body]);
}

const erc721OwnerAbi = [parseAbiItem("function ownerOf(uint256 tokenId) view returns (address)")] as const;

export function encodeErc721OwnerOfCalldata(tokenId: bigint): `0x${string}` {
  return encodeFunctionData({
    abi: erc721OwnerAbi,
    functionName: "ownerOf",
    args: [tokenId],
  });
}

export function decodeErc721OwnerOfResult(data: `0x${string}`): `0x${string}` {
  return decodeFunctionResult({
    abi: erc721OwnerAbi,
    functionName: "ownerOf",
    data,
  }) as `0x${string}`;
}

export function isLikelyFoundationMarketEscrow(owner: `0x${string}`): boolean {
  return FOUNDATION_MARKET_ESCROW_LOWERS.has(owner.toLowerCase());
}

export function foundationMarketEscrowAddressesForHelpText(): string {
  return `${FOUNDATION_ETH_MAINNET_NFT_MARKET}, ${FOUNDATION_ETH_MAINNET_NFT_MARKET_LEGACY}`;
}

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
