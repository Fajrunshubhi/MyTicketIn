import { formatDateTime, formatRupiah } from "@/lib/format";
import {
  downloadPdfBytes,
  helveticaWidth,
  PdfDocument,
  PDF_BRAND,
  PDF_BRAND_DARK,
  PDF_CANVAS,
  PDF_INK,
  PDF_LINE,
  PDF_MUTED,
  PDF_PAID,
  PDF_PAPER,
  PDF_WARN,
  pdfLatin,
  wrapToWidth,
  type PdfColor,
} from "@/lib/pdf-document";

export type ReceiptOrder = {
  orderNumber: string;
  status: string;
  createdAt?: string | null;
  subtotalRupiah: number;
  redeemedPoints: number;
  loyaltyDiscountRupiah: number;
  totalPayableRupiah: number;
  event?: {
    title?: string;
    slug?: string;
    startsAt?: string | null;
    timezone?: string;
    venueName?: string;
    city?: string;
    province?: string;
  };
  items: {
    name: string;
    quantity: number;
    unitPriceRupiah?: number;
    lineTotalRupiah: number;
    seatLabel?: string;
    attendees?: { fullName: string; email?: string; identityNumber?: string }[];
  }[];
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Menunggu pembayaran",
  PAID: "Lunas",
  EXPIRED: "Kedaluwarsa",
  CANCELLED: "Dibatalkan",
  FAILED: "Gagal",
};

const MARGIN = 40;
const FOOTER_H = 52;
const HEADER_H = 72;
const CONTENT_BOTTOM = FOOTER_H + 18;

function maskNik(raw?: string) {
  const n = String(raw || "").replace(/\D/g, "");
  if (n.length < 4) return "";
  return `${"x".repeat(Math.max(0, n.length - 4))}${n.slice(-4)}`;
}

function money(n: number) {
  try {
    return formatRupiah(Math.max(0, Math.trunc(n)));
  } catch {
    return "Rp0";
  }
}

function when(iso?: string | null, tz?: string) {
  if (!iso) return "-";
  try {
    return pdfLatin(formatDateTime(iso, tz || "Asia/Jakarta"));
  } catch {
    return "-";
  }
}

function documentTitle(status: string) {
  return status === "PAID" ? "BUKTI PEMBAYARAN" : "RINGKASAN ORDER";
}

function stampLabel(status: string) {
  if (status === "PAID") return "LUNAS";
  if (status === "PENDING") return "BELUM LUNAS";
  if (status === "EXPIRED") return "KEDALUWARSA";
  if (status === "CANCELLED") return "BATAL";
  if (status === "FAILED") return "GAGAL";
  return status;
}

function stampColor(status: string): PdfColor {
  if (status === "PAID") return PDF_PAID;
  if (status === "PENDING") return PDF_WARN;
  return PDF_MUTED;
}

export function buildOrderReceiptLines(order: ReceiptOrder, paymentMethod?: string): string[] {
  const paid = order.status === "PAID";
  const lines: string[] = [
    "MyTicketIn",
    "Platform tiket event tatap muka",
    "",
    documentTitle(order.status),
    paid ? "Transaksi sandbox (bukan faktur pajak)" : "Order belum lunas (bukan bukti bayar)",
    "",
    `Nomor order    : ${order.orderNumber}`,
    `Tanggal        : ${when(order.createdAt)}`,
    `Status         : ${STATUS_LABEL[order.status] || order.status}`,
  ];
  if (paymentMethod) lines.push(`Metode bayar   : ${paymentMethod}`);
  lines.push("");
  lines.push("Event");
  lines.push(order.event?.title || "-");
  const venue = [order.event?.venueName, order.event?.city, order.event?.province].filter(Boolean).join(", ");
  if (venue) lines.push(venue);
  if (order.event?.startsAt) lines.push(`Waktu          : ${when(order.event.startsAt, order.event.timezone)}`);
  lines.push("");
  lines.push("Rincian tiket");
  lines.push("----------------------------------------------");
  for (const item of order.items) {
    const unit = item.unitPriceRupiah != null ? money(item.unitPriceRupiah) : "-";
    const seat = item.seatLabel ? ` (${item.seatLabel})` : "";
    lines.push(`${item.name}${seat}`);
    lines.push(`  ${item.quantity} x ${unit} = ${money(item.lineTotalRupiah)}`);
    for (const a of item.attendees || []) {
      const nik = maskNik(a.identityNumber);
      lines.push(`  Pemegang: ${a.fullName}${a.email ? ` <${a.email}>` : ""}${nik ? ` NIK ${nik}` : ""}`);
    }
  }
  lines.push("----------------------------------------------");
  lines.push(`Subtotal                 ${money(order.subtotalRupiah)}`);
  if (order.loyaltyDiscountRupiah > 0 || order.redeemedPoints > 0) {
    lines.push(`Diskon poin (${order.redeemedPoints} poin)  - ${money(order.loyaltyDiscountRupiah)}`);
  }
  lines.push(`TOTAL DIBAYAR            ${money(order.totalPayableRupiah)}`);
  lines.push("");
  lines.push("Catatan");
  lines.push("Dokumen ini adalah receipt order MyTicketIn.");
  lines.push("Poin loyalty sandbox tidak bernilai tunai dan tidak dapat diuangkan.");
  if (paid) {
    lines.push("Simpan file ini sebagai bukti pembelian. Tiket QR ada di menu Tiket.");
  } else {
    lines.push("Selesaikan pembayaran sebelum waktu hold habis agar tiket diterbitkan.");
  }
  lines.push("Bantuan: gunakan halaman Order di aplikasi.");
  return lines;
}

function drawChrome(doc: PdfDocument, order: ReceiptOrder, page: number, pages: number, printedAt: string) {
  const w = doc.width;
  const h = doc.height;
  doc.fillRect(0, h - HEADER_H, w, HEADER_H, PDF_BRAND_DARK);
  doc.fillRect(MARGIN, h - 54, 28, 28, PDF_BRAND);
  doc.text("MT", MARGIN + 14, h - 45, { size: 9, bold: true, color: PDF_PAPER, align: "center" });
  doc.text("MYTICKETIN", MARGIN + 40, h - 38, { size: 16, bold: true, color: PDF_PAPER });
  doc.text("Event Ticketing  |  Dokumen transaksi digital", MARGIN + 40, h - 54, {
    size: 8,
    color: { r: 0.85, g: 0.82, b: 0.98 },
  });
  doc.fillRect(0, 0, w, FOOTER_H, PDF_CANVAS);
  doc.line(MARGIN, FOOTER_H, w - MARGIN, FOOTER_H, PDF_LINE, 0.6);
  doc.text("MyTicketIn  ·  Receipt digital  ·  Bukan faktur pajak (sandbox akademik)", MARGIN, 28, {
    size: 7.5,
    color: PDF_MUTED,
  });
  doc.text(`Dicetak ${printedAt}`, MARGIN, 16, { size: 7.5, color: PDF_MUTED });
  doc.text(`${order.orderNumber}  ·  Hal. ${page}/${pages}`, w - MARGIN, 22, {
    size: 7.5,
    color: PDF_MUTED,
    align: "right",
  });
}

function drawStamp(doc: PdfDocument, status: string, x: number, y: number) {
  const label = stampLabel(status);
  const color = stampColor(status);
  const size = 11;
  const tw = helveticaWidth(label, size);
  const padX = 10;
  const boxW = tw + padX * 2;
  const boxH = 22;
  doc.strokeRect(x, y, boxW, boxH, color, 1.6);
  doc.text(label, x + boxW / 2, y + 7, { size, bold: true, color, align: "center" });
}

export function buildOrderReceiptPdfBytes(order: ReceiptOrder, paymentMethod?: string): Uint8Array {
  const paid = order.status === "PAID";
  const printedAt = when(new Date().toISOString());
  const venue = [order.event?.venueName, order.event?.city, order.event?.province].filter(Boolean).join(", ");
  const right = 595 - MARGIN;
  const innerW = right - MARGIN;
  const colQty = 338;
  const colUnit = 418;
  const colAmt = right - 8;

  type Block =
    | { kind: "banner" }
    | { kind: "title" }
    | { kind: "cards" }
    | { kind: "tableHead" }
    | {
        kind: "item";
        name: string;
        qty: string;
        unit: string;
        amount: string;
        holders: string[];
      }
    | { kind: "totals" }
    | { kind: "notes" };

  const blocks: Block[] = [{ kind: "banner" }, { kind: "title" }, { kind: "cards" }, { kind: "tableHead" }];
  for (const item of order.items) {
    const holders: string[] = [];
    for (const a of item.attendees || []) {
      const nik = maskNik(a.identityNumber);
      holders.push(
        `Pemegang: ${a.fullName}${a.email ? `  ${a.email}` : ""}${nik ? `  NIK ${nik}` : ""}`,
      );
    }
    blocks.push({
      kind: "item",
      name: `${item.name}${item.seatLabel ? `  ·  ${item.seatLabel}` : ""}`,
      qty: String(item.quantity),
      unit: item.unitPriceRupiah != null ? money(item.unitPriceRupiah) : "-",
      amount: money(item.lineTotalRupiah),
      holders,
    });
  }
  blocks.push({ kind: "totals" }, { kind: "notes" });

  function measure(block: Block): number {
    if (block.kind === "banner") return 40;
    if (block.kind === "title") return 58;
    if (block.kind === "cards") return 92;
    if (block.kind === "tableHead") return 28;
    if (block.kind === "item") {
      const nameLines = wrapToWidth(block.name, 9.5, 250);
      return 16 + nameLines.length * 12 + block.holders.length * 11 + 8;
    }
    if (block.kind === "totals") return 86;
    return 78;
  }

  const pages: Block[][] = [[]];
  let used = 0;
  const firstBudget = 842 - HEADER_H - CONTENT_BOTTOM - 16;
  const nextBudget = 842 - HEADER_H - CONTENT_BOTTOM - 16;
  for (const block of blocks) {
    const h = measure(block);
    const budget = pages.length === 1 ? firstBudget : nextBudget;
    if (used + h > budget && pages[pages.length - 1].length > 0) {
      pages.push([{ kind: "tableHead" }]);
      used = 28;
      if (block.kind !== "item") {
        /* totals/notes on a fresh page without repeating table head if empty of items */
        if (pages[pages.length - 1].length === 1 && pages[pages.length - 1][0].kind === "tableHead") {
          pages[pages.length - 1] = [];
          used = 0;
        }
      }
    }
    pages[pages.length - 1].push(block);
    used += h;
  }

  const doc = new PdfDocument();
  for (let p = 0; p < pages.length; p += 1) {
    if (p > 0) doc.addPage();
    drawChrome(doc, order, p + 1, pages.length, printedAt);
    let y = 842 - HEADER_H - 18;

    const drawTableHead = () => {
      doc.fillRect(MARGIN, y - 16, innerW, 22, PDF_CANVAS);
      doc.text("DESKRIPSI", MARGIN + 10, y - 10, { size: 7.5, bold: true, color: PDF_MUTED });
      doc.text("QTY", colQty, y - 10, { size: 7.5, bold: true, color: PDF_MUTED, align: "right" });
      doc.text("HARGA SATUAN", colUnit, y - 10, { size: 7.5, bold: true, color: PDF_MUTED, align: "right" });
      doc.text("JUMLAH", colAmt, y - 10, { size: 7.5, bold: true, color: PDF_MUTED, align: "right" });
      y -= 28;
    };

    for (const block of pages[p]) {
      if (block.kind === "banner") {
        doc.fillRect(MARGIN, y - 24, innerW, 32, paid ? { r: 0.9, g: 0.97, b: 0.93 } : { r: 1, g: 0.95, b: 0.88 });
        doc.text(
          paid
            ? "TRANSAKSI UJI SANDBOX  ·  Dokumen ini sah sebagai bukti pembayaran di MyTicketIn, bukan faktur pajak."
            : "ORDER BELUM LUNAS  ·  Ringkasan ini bukan bukti pembayaran sampai status menjadi Lunas.",
          MARGIN + 10,
          y - 10,
          { size: 7.5, color: paid ? PDF_PAID : PDF_WARN, maxWidth: innerW - 20 },
        );
        y -= 40;
      }
      if (block.kind === "title") {
        doc.text(documentTitle(order.status), MARGIN, y - 4, { size: 18, bold: true, color: PDF_INK });
        const stamp = stampLabel(order.status);
        const stampW = helveticaWidth(stamp, 11) + 20;
        drawStamp(doc, order.status, right - stampW, y - 14);
        y -= 28;
        doc.text(`No. ${order.orderNumber}`, MARGIN, y, { size: 10, bold: true, color: PDF_BRAND_DARK });
        y -= 30;
      }
      if (block.kind === "cards") {
        const half = (innerW - 12) / 2;
        const boxH = 78;
        doc.strokeRect(MARGIN, y - boxH, half, boxH, PDF_LINE, 0.8);
        doc.strokeRect(MARGIN + half + 12, y - boxH, half, boxH, PDF_LINE, 0.8);
        doc.text("EVENT", MARGIN + 10, y - 14, { size: 7, bold: true, color: PDF_MUTED });
        doc.text(order.event?.title || "-", MARGIN + 10, y - 30, {
          size: 10,
          bold: true,
          maxWidth: half - 20,
        });
        let ey = y - 44;
        if (venue) {
          const h = doc.text(venue, MARGIN + 10, ey, { size: 8, color: PDF_MUTED, maxWidth: half - 20 });
          ey -= h;
        }
        if (order.event?.startsAt) {
          doc.text(when(order.event.startsAt, order.event.timezone), MARGIN + 10, ey, {
            size: 8,
            color: PDF_MUTED,
            maxWidth: half - 20,
          });
        }
        const dx = MARGIN + half + 22;
        doc.text("DOKUMEN", dx, y - 14, { size: 7, bold: true, color: PDF_MUTED });
        doc.text(`Tanggal  ${when(order.createdAt)}`, dx, y - 30, { size: 8.5, maxWidth: half - 20 });
        doc.text(`Status   ${STATUS_LABEL[order.status] || order.status}`, dx, y - 44, {
          size: 8.5,
          maxWidth: half - 20,
        });
        if (paymentMethod) {
          doc.text(`Metode   ${paymentMethod}`, dx, y - 58, { size: 8.5, maxWidth: half - 20 });
        }
        y -= boxH + 14;
      }
      if (block.kind === "tableHead") drawTableHead();
      if (block.kind === "item") {
        const nameLines = wrapToWidth(block.name, 9.5, 250);
        doc.text(block.name, MARGIN + 10, y, { size: 9.5, bold: true, maxWidth: 250 });
        doc.text(block.qty, colQty, y, { size: 9.5, align: "right" });
        doc.text(block.unit, colUnit, y, { size: 9.5, align: "right" });
        doc.text(block.amount, colAmt, y, { size: 9.5, bold: true, align: "right" });
        y -= 14 + Math.max(0, nameLines.length - 1) * 12;
        for (const holder of block.holders) {
          doc.text(holder, MARGIN + 10, y, { size: 8, color: PDF_MUTED, maxWidth: innerW - 24 });
          y -= 11;
        }
        y -= 8;
        doc.line(MARGIN, y + 4, right, y + 4, PDF_LINE, 0.4);
      }
      if (block.kind === "totals") {
        y -= 6;
        const boxX = 320;
        const boxW = right - boxX;
        const rows: [string, string, boolean][] = [["Subtotal", money(order.subtotalRupiah), false]];
        if (order.loyaltyDiscountRupiah > 0 || order.redeemedPoints > 0) {
          rows.push([`Diskon poin (${order.redeemedPoints})`, `- ${money(order.loyaltyDiscountRupiah)}`, false]);
        }
        const boxH = 20 + rows.length * 16 + 28;
        doc.fillRect(boxX, y - boxH, boxW, boxH, PDF_CANVAS);
        doc.strokeRect(boxX, y - boxH, boxW, boxH, PDF_LINE, 0.6);
        let ty = y - 16;
        for (const [label, value] of rows) {
          doc.text(label, boxX + 12, ty, { size: 9, color: PDF_MUTED });
          doc.text(value, right - 12, ty, { size: 9, align: "right" });
          ty -= 16;
        }
        doc.fillRect(boxX, y - boxH, boxW, 26, PDF_BRAND_DARK);
        doc.text("TOTAL DIBAYAR", boxX + 12, y - boxH + 9, { size: 9, bold: true, color: PDF_PAPER });
        doc.text(money(order.totalPayableRupiah), right - 12, y - boxH + 9, {
          size: 11,
          bold: true,
          color: PDF_PAPER,
          align: "right",
        });
        y -= boxH + 16;
      }
      if (block.kind === "notes") {
        doc.text("KETERANGAN", MARGIN, y, { size: 8, bold: true, color: PDF_MUTED });
        y -= 14;
        const notes = [
          "Dokumen ini diterbitkan secara elektronik oleh MyTicketIn dan berlaku sebagai receipt order.",
          "Poin loyalty sandbox tidak bernilai tunai dan tidak dapat diuangkan.",
          paid
            ? "Simpan file ini sebagai arsip pembelian. Tiket QR tetap diakses dari menu Tiket."
            : "Selesaikan pembayaran sebelum waktu hold habis agar tiket diterbitkan.",
          "Bantuan: buka halaman Order di aplikasi dengan nomor dokumen di atas.",
        ];
        for (const note of notes) {
          const h = doc.text(`-  ${note}`, MARGIN, y, { size: 8, color: PDF_MUTED, maxWidth: innerW });
          y -= h + 2;
        }
      }
    }
  }

  return doc.bytes();
}

export async function downloadOrderReceiptPdf(order: ReceiptOrder, paymentMethod?: string): Promise<void> {
  const bytes = buildOrderReceiptPdfBytes(order, paymentMethod);
  downloadPdfBytes(`receipt-${order.orderNumber}.pdf`, bytes);
}
