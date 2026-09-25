"use client";

import QRCode from "qrcode";

export async function renderQrPngBlob(text: string): Promise<Blob> {
  const payload = text.replace(/\s/g, "");
  const dataUrl = await QRCode.toDataURL(payload, {
    width: 320,
    margin: 4,
    errorCorrectionLevel: "M",
    color: { dark: "#111111", light: "#ffffff" },
  });
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  if (!blob.size) throw new Error("empty-qr");
  return blob;
}
