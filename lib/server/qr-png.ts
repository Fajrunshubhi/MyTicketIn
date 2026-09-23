import QRCode from "qrcode";

export async function renderTicketQrPng(token: string): Promise<Buffer> {
  return QRCode.toBuffer(token, {
    type: "png",
    width: 320,
    margin: 4,
    errorCorrectionLevel: "M",
    color: { dark: "#111111", light: "#ffffff" },
  });
}
