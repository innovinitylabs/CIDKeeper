import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AppProviders } from "@/app/providers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CIDKeeper — Backup and preserve your NFTs before they disappear",
  description:
    "NFTs aren't permanent unless someone keeps the data alive. CIDKeeper scans your wallet, checks which assets are still accessible, and lets you download the original files exactly as stored on IPFS. Keep a local backup or re-pin them on your own terms.",
  icons: {
    icon: [{ url: "/valipokkann.svg", type: "image/svg+xml" }],
    shortcut: "/valipokkann.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
