import JSZip from "jszip";
import type { Manifest } from "@/types/nft";

/**
 * Builds a ZIP with exact bytes per CID under exports/ plus exports/manifest.json.
 * Critical: files are appended as Uint8Array only (no transcoding).
 */
export async function buildExportZip(
  manifest: Manifest,
  files: Map<string, { filename: string; bytes: Uint8Array }>,
): Promise<Uint8Array> {
  const zip = new JSZip();
  const root = zip.folder("exports");
  if (!root) throw new Error("zip_folder_failed");

  // Each entry is raw bytes keyed by CID; filenames are `${cid}${ext}` only.
  for (const [, entry] of files) {
    root.file(entry.filename, entry.bytes, { binary: true });
  }

  const manifestText = JSON.stringify(manifest, null, 2);
  root.file("manifest.json", manifestText);

  const out = await zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  return out;
}
