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
const SITE_NAME = "CIDKeeper";
const SITE_TITLE = "CIDKeeper — Backup and preserve your NFTs before they disappear";
const SITE_DESCRIPTION =
  "NFTs are not permanent unless someone keeps the data alive. CIDKeeper scans your wallet, checks which assets are still accessible, and lets you download the original files exactly as stored on IPFS. Optional pin-by-CID via 4EVERLAND using your pin access token or server configuration. Keep a local backup for safety.";

const STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: SITE_URL,
      name: SITE_NAME,
      description: SITE_DESCRIPTION,
      inLanguage: "en",
    },
    {
      "@type": "SoftwareApplication",
      "@id": `${SITE_URL}/#app`,
      name: SITE_NAME,
      applicationCategory: "UtilitiesApplication",
      operatingSystem: "Web",
      url: SITE_URL,
      description:
        "NFT backup and preservation tool for IPFS and NFT metadata, with gateway health checks, ZIP export, and optional 4EVERLAND CID pinning.",
      featureList: [
        "IPFS CID extraction from NFT metadata",
        "IPFS gateway health checks",
        "NFT asset ZIP export with manifest",
        "Pin existing IPFS CIDs with 4EVERLAND",
        "Foundation marketplace listing checks",
      ],
      keywords: [
        "ipfs backup",
        "nft backup",
        "ipfs pinning",
        "4everland",
        "foundation marketplace listing",
        "nft listing status",
        "nft metadata recovery",
      ],
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
      },
    },
    {
      "@type": "FAQPage",
      "@id": `${SITE_URL}/#faq`,
      mainEntity: [
        {
          "@type": "Question",
          name: "How do I back up NFT files from IPFS?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "CIDKeeper scans your wallet, extracts metadata, image, and animation CIDs, checks gateway availability, and exports exact bytes into a ZIP with a manifest.",
          },
        },
        {
          "@type": "Question",
          name: "Does CIDKeeper upload files when pinning?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "No. CIDKeeper submits existing IPFS CIDs to 4EVERLAND pinning service. It does not re-upload new file bytes during pin-by-CID.",
          },
        },
        {
          "@type": "Question",
          name: "Can I check Foundation marketplace listing status?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Yes. CIDKeeper can resolve whether NFTs are currently listed on Foundation marketplace and help you filter listed or unlisted items.",
          },
        },
      ],
    },
  ],
} as const;

export const metadata: Metadata = {
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    "IPFS",
    "IPFS pinning",
    "NFT backup",
    "NFT preservation",
    "NFT metadata",
    "CID pinning",
    "4EVERLAND",
    "Foundation marketplace",
    "NFT listing checker",
    "Arweave",
    "Ethereum NFTs",
  ],
  category: "technology",
  creator: "CIDKeeper",
  publisher: "CIDKeeper",
  authors: [{ name: "CIDKeeper" }],
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  metadataBase: new URL(SITE_URL),
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "CIDKeeper",
    title: SITE_TITLE,
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
    title: SITE_TITLE,
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
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(STRUCTURED_DATA) }}
        />
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
