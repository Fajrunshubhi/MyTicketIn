import QRCode from "qrcode";
import { AppError } from "@/lib/server/http";

type QrLib = {
  toBuffer: (text: string, opts: Record<string, unknown>) => Promise<Buffer>;
};

function qrLib(): QrLib {
  const mod = QRCode as unknown as QrLib & { default?: QrLib };
  if (typeof mod.toBuffer === "function") return mod;
  if (mod.default && typeof mod.default.toBuffer === "function") return mod.default;
  throw new AppError("TICKET_CRYPTO_FAILED", "Kode QR tidak dapat ditampilkan.", {}, 500);
}

export async function renderTicketQrPng(token: string): Promise<Buffer> {
  try {
    const png = await qrLib().toBuffer(token, {
      type: "png",
      width: 320,
      margin: 4,
      errorCorrectionLevel: "M",
      color: { dark: "#111111", light: "#ffffff" },
    });
    return Buffer.from(png);
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError("TICKET_CRYPTO_FAILED", "Kode QR tidak dapat ditampilkan.", {}, 500);
  }
}
