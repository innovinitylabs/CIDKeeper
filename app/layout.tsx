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

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

export const metadata: Metadata = {
  title: "CIDKeeper — Backup and preserve your NFTs before they disappear",
  description:
    "NFTs are not permanent unless someone keeps the data alive. CIDKeeper scans your wallet, checks which assets are still accessible, and lets you download the original files exactly as stored on IPFS. Optional pin-by-CID via 4EVERLAND using your pin access token or server configuration. Keep a local backup for safety.",
  metadataBase: new URL(SITE_URL),
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "CIDKeeper",
    title: "CIDKeeper — Backup and preserve your NFTs before they disappear",
    description:
      "Scan your wallet, check NFT asset health, export exact bytes, and pin existing CIDs through 4EVERLAND.",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "CIDKeeper — Backup and preserve your NFTs",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "CIDKeeper — Backup and preserve your NFTs before they disappear",
    description: "Scan wallet NFTs, verify IPFS health, export backups, and pin existing CIDs via 4EVERLAND.",
    images: ["/opengraph-image"],
  },
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
