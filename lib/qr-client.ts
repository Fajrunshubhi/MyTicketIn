"use client";

import QRCode from "qrcode";

export async function renderQrDataUrl(text: string): Promise<string> {
  const payload = text.replace(/\s/g, "");
  return QRCode.toDataURL(payload, {
    width: 320,
    margin: 4,
    errorCorrectionLevel: "M",
    color: { dark: "#111111", light: "#ffffff" },
  });
}

export async function renderQrPngBlob(text: string): Promise<Blob> {
  const dataUrl = await renderQrDataUrl(text);
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  if (!blob.size) throw new Error("empty-qr");
  return blob;
}
