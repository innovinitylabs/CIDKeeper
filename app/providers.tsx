"use client";

import { BrowserWalletProvider } from "@/app/components/BrowserWalletProvider";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return <BrowserWalletProvider>{children}</BrowserWalletProvider>;
}
