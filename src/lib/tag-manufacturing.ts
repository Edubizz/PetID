/**
 * Manufacturing export for physical PetID tags.
 * Tokens are identity; URLs are built from configured production origin.
 */

import QRCode from "qrcode";
import JSZip from "jszip";
import { physicalTagUrl } from "@/lib/app-url";

export type ManufacturedTagRow = {
  human_serial: string;
  public_token: string;
  activation_code: string;
};

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function buildTagManifestCsv(
  batchCode: string,
  tags: ManufacturedTagRow[],
): string {
  const header = ["batch", "serial", "public_token", "public_url", "activation_code"];
  const lines = [header.join(",")];
  for (const t of tags) {
    lines.push(
      [
        csvEscape(batchCode),
        csvEscape(t.human_serial),
        csvEscape(t.public_token),
        csvEscape(physicalTagUrl(t.public_token)),
        csvEscape(t.activation_code),
      ].join(","),
    );
  }
  return lines.join("\n");
}

export async function buildTagManufacturingZip(
  batchCode: string,
  tags: ManufacturedTagRow[],
): Promise<Blob> {
  const zip = new JSZip();
  zip.file(`${batchCode}-manifest.csv`, buildTagManifestCsv(batchCode, tags));

  const qrFolder = zip.folder("qr-svg");
  if (!qrFolder) throw new Error("ZIP folder failed");

  for (const t of tags) {
    const url = physicalTagUrl(t.public_token);
    const svg = await QRCode.toString(url, {
      type: "svg",
      errorCorrectionLevel: "M",
      margin: 2,
      width: 512,
    });
    qrFolder.file(`${t.human_serial}.svg`, svg);
  }

  return zip.generateAsync({ type: "blob" });
}

export function downloadBlob(blob: Blob, filename: string) {
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(href);
}
