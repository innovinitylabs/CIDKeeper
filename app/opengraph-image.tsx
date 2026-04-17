import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "CIDKeeper — Backup and preserve your NFTs";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "56px",
          background:
            "radial-gradient(circle at top right, #3f5efb 0%, #101827 45%, #0a0f1a 100%)",
          color: "white",
          fontFamily: "Inter, system-ui, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "16px",
            fontSize: 28,
            fontWeight: 700,
            letterSpacing: "0.02em",
            opacity: 0.96,
          }}
        >
          CIDKeeper
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "18px", maxWidth: 980 }}>
          <div style={{ fontSize: 68, lineHeight: 1.05, fontWeight: 800 }}>
            Backup and preserve your NFTs before they disappear
          </div>
          <div style={{ fontSize: 32, lineHeight: 1.3, opacity: 0.92 }}>
            Scan wallet assets, verify gateway health, export exact bytes, and pin existing CIDs.
          </div>
        </div>

        <div style={{ display: "flex", gap: "14px", fontSize: 24, opacity: 0.9 }}>
          <div>IPFS Health</div>
          <div>ZIP Export</div>
          <div>4EVERLAND Pinning</div>
        </div>
      </div>
    ),
    {
      ...size,
    },
  );
}
