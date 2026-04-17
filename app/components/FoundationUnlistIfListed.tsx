"use client";

import { useEffect, useState } from "react";
import { FoundationUnlistButton } from "@/app/components/FoundationUnlistButton";
import { HEADER_ALCHEMY_API_KEY } from "@/lib/user-provider-keys";

function useFoundationListed(
  contractAddress: string,
  tokenId: string,
  providerHeaders: Record<string, string>,
): boolean | null {
  const [listed, setListed] = useState<boolean | null>(null);
  const alchemyKey = providerHeaders[HEADER_ALCHEMY_API_KEY]?.trim() ?? "";

  useEffect(() => {
    let cancelled = false;
    setListed(null);

    (async () => {
      try {
        const headers: Record<string, string> = {};
        if (alchemyKey) headers[HEADER_ALCHEMY_API_KEY] = alchemyKey;

        const res = await fetch(
          `/api/nft-foundation-listed?contract=${encodeURIComponent(contractAddress.trim())}&tokenId=${encodeURIComponent(tokenId.trim())}`,
          { headers, cache: "no-store" },
        );
        const j = (await res.json().catch(() => ({}))) as { listed?: boolean };
        if (cancelled) return;
        setListed(Boolean(j.listed));
      } catch {
        if (!cancelled) setListed(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [alchemyKey, contractAddress, tokenId]);

  return listed;
}

type HeadersProps = {
  contractAddress: string;
  tokenId: string;
  providerHeaders: Record<string, string>;
};

export function FoundationUnlistIfListed({
  contractAddress,
  tokenId,
  compact,
  className,
  providerHeaders,
}: HeadersProps & {
  compact?: boolean;
  className?: string;
}) {
  const listed = useFoundationListed(contractAddress, tokenId, providerHeaders);
  if (listed !== true) return null;

  return (
    <FoundationUnlistButton contractAddress={contractAddress} tokenId={tokenId} compact={compact} className={className} />
  );
}

export function FoundationMarketListingSection({ contractAddress, tokenId, providerHeaders }: HeadersProps) {
  const listed = useFoundationListed(contractAddress, tokenId, providerHeaders);
  if (listed !== true) return null;

  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        Foundation listing
      </div>
      <p className="mt-1 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
        On Ethereum mainnet, CIDKeeper checks whether this token is still held by the Foundation market contract before
        opening your wallet. If you already unlisted, the NFT is usually back in your wallet and the shortcut will
        explain that instead of sending a reverting transaction.
      </p>
      <div className="mt-2">
        <FoundationUnlistButton contractAddress={contractAddress} tokenId={tokenId} />
      </div>
    </div>
  );
}
