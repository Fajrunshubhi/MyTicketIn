import { formatDateLong, formatDateTime, formatRupiah } from "@/lib/format";
import {
  completedRefunds,
  completedRefundTotal,
  orderDocumentKind,
  orderDocumentTitle,
  orderStampLabel,
  orderStatusUiLabel,
  refundSourceUiLabel,
  type OrderDocumentKind,
  type RefundSnippet,
} from "@/lib/order-refund-display";
import { orderDocumentVerifyUrl, platformDocumentIssuer } from "@/lib/platform-document";
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
import { STAMP_DUTY_THRESHOLD_RUPIAH, terbilangRupiah } from "@/lib/rupiah-terbilang";

export type ReceiptOrder = {
  id?: string;
  orderNumber: string;
  status: string;
  createdAt?: string | null;
  paidAt?: string | null;
  subtotalRupiah: number;
  redeemedPoints: number;
  loyaltyDiscountRupiah: number;
  promoDiscountRupiah?: number;
  promoCode?: string | null;
  totalPayableRupiah: number;
  organizerName?: string;
  buyer?: { name?: string; email?: string; phone?: string };
  payment?: { method?: string; provider?: string; externalReference?: string };
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
  refunds?: RefundSnippet[];
  ticketsCancelled?: boolean;
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

function placeDate(iso?: string | null) {
  const issuer = platformDocumentIssuer();
  if (!iso) return issuer.city;
  try {
    return pdfLatin(`${issuer.city}, ${formatDateLong(iso)}`);
  } catch {
    return issuer.city;
  }
}

function documentKind(order: ReceiptOrder): OrderDocumentKind {
  return orderDocumentKind(order.status, order.refunds, Boolean(order.ticketsCancelled));
}

function stampColor(kind: OrderDocumentKind): PdfColor {
  if (kind === "paid") return PDF_PAID;
  if (kind === "pending") return PDF_WARN;
  if (kind === "cancelled" || kind === "refunded") return PDF_WARN;
  return PDF_MUTED;
}

function methodLabel(raw?: string) {
  if (!raw) return "";
  if (raw === "QRIS") return "QRIS";
  if (raw === "EWALLET") return "E-wallet";
  if (raw === "VIRTUAL_ACCOUNT") return "Virtual Account";
  return raw.replace(/_/g, " ");
}

function payVia(provider?: string) {
  if (String(provider || "").toLowerCase() === "midtrans") return "Midtrans";
  return "MyTicketIn";
}

function buyerName(order: ReceiptOrder) {
  const named = String(order.buyer?.name || "").trim();
  if (named) return named;
  for (const item of order.items) {
    const first = item.attendees?.[0]?.fullName?.trim();
    if (first) return first;
  }
  return "Pembeli MyTicketIn";
}

function issuerLines(order: ReceiptOrder): string[] {
  const issuer = platformDocumentIssuer();
  const lines = [issuer.name, issuer.tagline];
  if (issuer.address) lines.push(issuer.address);
  if (issuer.email) lines.push(issuer.email);
  if (issuer.phone) lines.push(issuer.phone);
  if (issuer.nib) lines.push(`NIB ${issuer.nib}`);
  if (issuer.npwp) lines.push(`NPWP ${issuer.npwp}`);
  if (order.organizerName) lines.push(`Penyelenggara event: ${order.organizerName}`);
  return lines;
}

function buyerLines(order: ReceiptOrder): string[] {
  const lines = [buyerName(order)];
  if (order.buyer?.email) lines.push(order.buyer.email);
  if (order.buyer?.phone) lines.push(order.buyer.phone);
  if (order.id) lines.push(`Order ID ${order.id}`);
  return lines;
}

function paymentMethodOf(order: ReceiptOrder, fallback?: string) {
  return methodLabel(order.payment?.method) || fallback || "";
}

function bannerText(kind: OrderDocumentKind): string {
  if (kind === "paid") {
    return "Dokumen transaksi elektronik. Berlaku sebagai kuitansi dan bukti penerimaan uang di MyTicketIn. Bukan faktur pajak.";
  }
  if (kind === "cancelled") {
    return "PEMBATALAN SELESAI  ·  Tiket tidak berlaku untuk masuk. Refund telah dicatat.";
  }
  if (kind === "refunded") {
    return "REFUND SELESAI  ·  Tiket tidak berlaku. Simpan dokumen ini sebagai arsip.";
  }
  return "ORDER BELUM LUNAS  ·  Ringkasan ini bukan bukti pembayaran sampai status menjadi Lunas.";
}

function kuitansiPurpose(order: ReceiptOrder): string {
  const event = order.event?.title || "tiket event";
  return `pembelian tiket ${event} (order ${order.orderNumber})`;
}

function legalNotes(kind: OrderDocumentKind, paid: boolean, amount: number): string[] {
  const notes = [
    "Diterbitkan secara elektronik oleh sistem MyTicketIn. Informasi dan hasil cetaknya merupakan alat bukti yang sah sepanjang dapat diakses, ditampilkan, dijamin keutuhannya, dan dipertanggungjawabkan (UU ITE).",
    "Dokumen ini adalah kuitansi/bukti penerimaan uang, bukan faktur pajak dan bukan bukti pemungutan PPN.",
    "Poin loyalty tidak bernilai tunai dan tidak dapat diuangkan.",
  ];
  if (kind === "cancelled" || kind === "refunded") {
    notes.push("Tiket QR tidak berlaku untuk masuk. Simpan file ini sebagai arsip transaksi.");
  } else if (paid) {
    notes.push("Simpan file ini sebagai arsip pembelian. Tiket QR tetap diakses dari menu Tiket.");
  } else {
    notes.push("Selesaikan pembayaran sebelum waktu hold habis agar tiket diterbitkan.");
  }
  if (paid && amount > STAMP_DUTY_THRESHOLD_RUPIAH) {
    notes.push(
      "Nilai lebih dari Rp5.000.000. Jika dokumen dipakai sebagai alat bukti, bea meterai Rp10.000 dapat dilengkapi dengan meterai elektronik sesuai UU 10/2020.",
    );
  }
  notes.push("Bantuan: buka tautan verifikasi atau halaman Order di aplikasi dengan nomor dokumen ini.");
  return notes;
}

export function buildOrderReceiptLines(order: ReceiptOrder, paymentMethod?: string): string[] {
  const kind = documentKind(order);
  const livePaid = kind === "paid";
  const refunded = completedRefundTotal(order.refunds);
  const leftover = Math.max(0, order.totalPayableRupiah - refunded);
  const method = paymentMethodOf(order, paymentMethod);
  const issuer = platformDocumentIssuer();
  const lines: string[] = [
    issuer.name,
    issuer.tagline,
    "",
    orderDocumentTitle(kind),
    bannerText(kind),
    "",
    `No. dokumen    : ${order.orderNumber}`,
  ];
  if (order.id) lines.push(`Order ID       : ${order.id}`);
  lines.push(`Tanggal order  : ${when(order.createdAt)}`);
  if (order.paidAt) lines.push(`Tanggal lunas  : ${when(order.paidAt)}`);
  lines.push(`Status         : ${orderStatusUiLabel(kind)}`);
  lines.push(`Cap dokumen    : ${orderStampLabel(kind)}`);
  if (method) lines.push(`Metode bayar   : ${method}`);
  if (order.payment?.externalReference) {
    lines.push(`Referensi bayar: ${order.payment.externalReference}`);
  }
  if (order.payment?.provider) lines.push(`Bayar melalui  : ${payVia(order.payment.provider)}`);
  lines.push("");
  lines.push("Diterbitkan oleh");
  for (const row of issuerLines(order)) lines.push(row);
  lines.push("");
  lines.push("Ditujukan kepada");
  for (const row of buyerLines(order)) lines.push(row);
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
  if (order.promoDiscountRupiah) {
    lines.push(`Kode promo ${order.promoCode ?? ""}  - ${money(order.promoDiscountRupiah)}`);
  }
  if (order.loyaltyDiscountRupiah > 0 || order.redeemedPoints > 0) {
    lines.push(`Diskon poin (${order.redeemedPoints} poin)  - ${money(order.loyaltyDiscountRupiah)}`);
  }
  lines.push(`TOTAL DIBAYAR            ${money(order.totalPayableRupiah)}`);
  if (livePaid) {
    lines.push(`Terbilang      : ${terbilangRupiah(order.totalPayableRupiah)}`);
    lines.push(`Telah diterima dari ${buyerName(order)} untuk ${kuitansiPurpose(order)}.`);
  }
  if (refunded > 0) {
    lines.push(`REFUND                  - ${money(refunded)}`);
    if (kind === "cancelled") lines.push(`TIDAK DIKEMBALIKAN       ${money(leftover)}`);
    else lines.push(`SISA SETELAH REFUND      ${money(leftover)}`);
    for (const rf of completedRefunds(order.refunds)) {
      const src = refundSourceUiLabel(rf.source);
      lines.push(`  ${rf.refundNumber || "Refund"} ${src ? `(${src}) ` : ""}${money(rf.amountRupiah)}`);
    }
  }
  const verify = orderDocumentVerifyUrl(order.id);
  lines.push("");
  lines.push("Catatan");
  for (const note of legalNotes(kind, livePaid, order.totalPayableRupiah)) lines.push(note);
  if (verify) lines.push(`Verifikasi: ${verify}`);
  return lines;
}

function drawChrome(doc: PdfDocument, order: ReceiptOrder, page: number, pages: number, printedAt: string) {
  const w = doc.width;
  const h = doc.height;
  doc.fillRect(0, h - HEADER_H, w, HEADER_H, PDF_BRAND_DARK);
  doc.fillRect(MARGIN, h - 54, 28, 28, PDF_BRAND);
  doc.text("MT", MARGIN + 14, h - 45, { size: 9, bold: true, color: PDF_PAPER, align: "center" });
  doc.text("MYTICKETIN", MARGIN + 40, h - 38, { size: 16, bold: true, color: PDF_PAPER });
  doc.text("Event Ticketing  |  Kuitansi dan bukti transaksi elektronik", MARGIN + 40, h - 54, {
    size: 8,
    color: { r: 0.85, g: 0.82, b: 0.98 },
  });
  doc.fillRect(0, 0, w, FOOTER_H, PDF_CANVAS);
  doc.line(MARGIN, FOOTER_H, w - MARGIN, FOOTER_H, PDF_LINE, 0.6);
  doc.text("MyTicketIn  ·  Kuitansi elektronik  ·  Bukan faktur pajak", MARGIN, 28, {
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

function drawStamp(doc: PdfDocument, kind: OrderDocumentKind, x: number, y: number) {
  const label = orderStampLabel(kind);
  const color = stampColor(kind);
  const size = 11;
  const tw = helveticaWidth(label, size);
  const padX = 10;
  const boxW = tw + padX * 2;
  const boxH = 22;
  doc.strokeRect(x, y, boxW, boxH, color, 1.6);
  doc.text(label, x + boxW / 2, y + 7, { size, bold: true, color, align: "center" });
}

function lineBlockHeight(rows: string[], width: number) {
  let h = 0;
  for (const row of rows) h += wrapToWidth(row, 8, width).length * 11;
  return h;
}

export function buildOrderReceiptPdfBytes(order: ReceiptOrder, paymentMethod?: string): Uint8Array {
  const kind = documentKind(order);
  const paid = kind === "paid";
  const refunded = completedRefundTotal(order.refunds);
  const leftover = Math.max(0, order.totalPayableRupiah - refunded);
  const printedAt = when(new Date().toISOString());
  const venue = [order.event?.venueName, order.event?.city, order.event?.province].filter(Boolean).join(", ");
  const right = 595 - MARGIN;
  const innerW = right - MARGIN;
  const colQty = 338;
  const colUnit = 418;
  const colAmt = right - 8;
  const method = paymentMethodOf(order, paymentMethod);
  const fromRows = issuerLines(order);
  const toRows = buyerLines(order);
  const half = (innerW - 12) / 2;
  const partyH = 28 + Math.max(lineBlockHeight(fromRows, half - 20), lineBlockHeight(toRows, half - 20));
  const notes = legalNotes(kind, paid, order.totalPayableRupiah);
  const verify = orderDocumentVerifyUrl(order.id);
  const terbilang = paid ? terbilangRupiah(order.totalPayableRupiah) : "";
  const purpose = kuitansiPurpose(order);

  type Block =
    | { kind: "banner" }
    | { kind: "title" }
    | { kind: "parties" }
    | { kind: "payment" }
    | { kind: "event" }
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
    | { kind: "kuitansi" }
    | { kind: "notes" };

  const blocks: Block[] = [
    { kind: "banner" },
    { kind: "title" },
    { kind: "parties" },
    { kind: "payment" },
    { kind: "event" },
    { kind: "tableHead" },
  ];
  for (const item of order.items) {
    const holders: string[] = [];
    for (const a of item.attendees || []) {
      const nik = maskNik(a.identityNumber);
      holders.push(`Pemegang: ${a.fullName}${a.email ? `  ${a.email}` : ""}${nik ? `  NIK ${nik}` : ""}`);
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
  blocks.push({ kind: "totals" });
  if (paid) blocks.push({ kind: "kuitansi" });
  blocks.push({ kind: "notes" });

  function measure(block: Block): number {
    if (block.kind === "banner") return 40;
    if (block.kind === "title") return 62;
    if (block.kind === "parties") return partyH + 14;
    if (block.kind === "payment") return 56;
    if (block.kind === "event") return venue ? 52 : 38;
    if (block.kind === "tableHead") return 28;
    if (block.kind === "item") {
      const nameLines = wrapToWidth(block.name, 9.5, 250);
      return 16 + nameLines.length * 12 + block.holders.length * 11 + 8;
    }
    if (block.kind === "totals") return refunded > 0 ? 132 : 86;
    if (block.kind === "kuitansi") {
      return 28 + wrapToWidth(terbilang, 9, innerW - 24).length * 12 + wrapToWidth(purpose, 8, innerW - 24).length * 11 + 46;
    }
    let h = 18;
    for (const note of notes) h += wrapToWidth(`-  ${note}`, 8, innerW).length * 11 + 2;
    if (verify) h += 16;
    return h + 8;
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
        const live = kind === "paid";
        doc.fillRect(MARGIN, y - 24, innerW, 32, live ? { r: 0.9, g: 0.97, b: 0.93 } : { r: 1, g: 0.95, b: 0.88 });
        doc.text(bannerText(kind), MARGIN + 10, y - 10, {
          size: 7.5,
          color: live ? PDF_PAID : PDF_WARN,
          maxWidth: innerW - 20,
        });
        y -= 40;
      }
      if (block.kind === "title") {
        doc.text(orderDocumentTitle(kind), MARGIN, y - 4, { size: 16, bold: true, color: PDF_INK });
        const stamp = orderStampLabel(kind);
        const stampW = helveticaWidth(stamp, 11) + 20;
        drawStamp(doc, kind, right - stampW, y - 14);
        y -= 26;
        doc.text(`No. ${order.orderNumber}`, MARGIN, y, { size: 10, bold: true, color: PDF_BRAND_DARK });
        if (order.id) {
          doc.text(`Order ID  ${order.id}`, right, y, { size: 8, color: PDF_MUTED, align: "right" });
        }
        y -= 36;
      }
      if (block.kind === "parties") {
        const boxH = partyH;
        doc.strokeRect(MARGIN, y - boxH, half, boxH, PDF_LINE, 0.8);
        doc.strokeRect(MARGIN + half + 12, y - boxH, half, boxH, PDF_LINE, 0.8);
        doc.text("DITERBITKAN OLEH", MARGIN + 10, y - 14, { size: 7, bold: true, color: PDF_MUTED });
        let ly = y - 30;
        for (const row of fromRows) {
          const h = doc.text(row, MARGIN + 10, ly, {
            size: row === fromRows[0] ? 10 : 8,
            bold: row === fromRows[0],
            color: row === fromRows[0] ? PDF_INK : PDF_MUTED,
            maxWidth: half - 20,
          });
          ly -= h;
        }
        doc.text("DITUJUKAN KEPADA", MARGIN + half + 22, y - 14, { size: 7, bold: true, color: PDF_MUTED });
        let ry = y - 30;
        for (const row of toRows) {
          const h = doc.text(row, MARGIN + half + 22, ry, {
            size: row === toRows[0] ? 10 : 8,
            bold: row === toRows[0],
            color: row === toRows[0] ? PDF_INK : PDF_MUTED,
            maxWidth: half - 20,
          });
          ry -= h;
        }
        y -= boxH + 14;
      }
      if (block.kind === "payment") {
        doc.fillRect(MARGIN, y - 40, innerW, 44, { r: 1, g: 0.97, b: 0.9 });
        const paidLabel = order.paidAt ? when(order.paidAt) : when(order.createdAt);
        doc.text(paid ? "Tanggal lunas" : "Tanggal dokumen", MARGIN + 10, y - 12, {
          size: 7,
          bold: true,
          color: PDF_MUTED,
        });
        doc.text(paidLabel, MARGIN + 10, y - 26, { size: 8.5, maxWidth: 150 });
        doc.text("Metode", MARGIN + 170, y - 12, { size: 7, bold: true, color: PDF_MUTED });
        doc.text(method || "-", MARGIN + 170, y - 26, { size: 8.5, maxWidth: 110 });
        doc.text("Bayar melalui", MARGIN + 300, y - 12, { size: 7, bold: true, color: PDF_MUTED });
        doc.text(payVia(order.payment?.provider), MARGIN + 300, y - 26, { size: 8.5, maxWidth: 90 });
        if (order.payment?.externalReference) {
          doc.text("Referensi", right - 8, y - 12, { size: 7, bold: true, color: PDF_MUTED, align: "right" });
          doc.text(order.payment.externalReference, right - 8, y - 26, {
            size: 7.5,
            align: "right",
            maxWidth: 120,
          });
        }
        y -= 56;
      }
      if (block.kind === "event") {
        doc.text("LAYANAN", MARGIN, y, { size: 7, bold: true, color: PDF_MUTED });
        y -= 14;
        doc.text(order.event?.title || "-", MARGIN, y, { size: 10, bold: true, maxWidth: innerW });
        y -= 14;
        if (venue) {
          doc.text(venue, MARGIN, y, { size: 8, color: PDF_MUTED, maxWidth: innerW });
          y -= 12;
        }
        if (order.event?.startsAt) {
          doc.text(when(order.event.startsAt, order.event.timezone), MARGIN, y, {
            size: 8,
            color: PDF_MUTED,
            maxWidth: innerW,
          });
          y -= 12;
        }
        y -= 8;
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
        const rows: [string, string][] = [["Subtotal", money(order.subtotalRupiah)]];
        if (order.promoDiscountRupiah) {
          rows.push([`Kode promo ${order.promoCode ?? ""}`, `- ${money(order.promoDiscountRupiah)}`]);
        }
        if (order.loyaltyDiscountRupiah > 0 || order.redeemedPoints > 0) {
          rows.push([`Diskon poin (${order.redeemedPoints})`, `- ${money(order.loyaltyDiscountRupiah)}`]);
        }
        if (refunded > 0) {
          rows.push(["Refund", `- ${money(refunded)}`]);
          rows.push([kind === "cancelled" ? "Tidak dikembalikan" : "Sisa setelah refund", money(leftover)]);
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
      if (block.kind === "kuitansi") {
        const boxH = measure({ kind: "kuitansi" }) - 8;
        doc.strokeRect(MARGIN, y - boxH, innerW, boxH, PDF_LINE, 0.8);
        doc.text("PERNYATAAN PENERIMAAN", MARGIN + 10, y - 14, { size: 7, bold: true, color: PDF_MUTED });
        let ky = y - 30;
        ky -= doc.text(`Telah diterima dari ${buyerName(order)}`, MARGIN + 10, ky, {
          size: 9,
          maxWidth: innerW - 20,
        });
        ky -= doc.text(`Uang sejumlah ${terbilang}`, MARGIN + 10, ky, {
          size: 9,
          bold: true,
          maxWidth: innerW - 20,
        });
        ky -= doc.text(`Untuk pembayaran ${purpose}`, MARGIN + 10, ky, {
          size: 8,
          color: PDF_MUTED,
          maxWidth: innerW - 20,
        });
        ky -= 6;
        doc.text(placeDate(order.paidAt || order.createdAt), MARGIN + 10, ky, { size: 8, color: PDF_MUTED });
        doc.text("Diterbitkan secara elektronik oleh sistem MyTicketIn", right - 10, ky, {
          size: 8,
          color: PDF_MUTED,
          align: "right",
        });
        y -= boxH + 12;
      }
      if (block.kind === "notes") {
        doc.text("KETERANGAN", MARGIN, y, { size: 8, bold: true, color: PDF_MUTED });
        y -= 14;
        for (const note of notes) {
          const h = doc.text(`-  ${note}`, MARGIN, y, { size: 8, color: PDF_MUTED, maxWidth: innerW });
          y -= h + 2;
        }
        if (verify) {
          y -= 4;
          doc.text(`Verifikasi keaslian: ${verify}`, MARGIN, y, { size: 8, color: PDF_BRAND_DARK, maxWidth: innerW });
        }
      }
    }
  }

  return doc.bytes();
}

export async function downloadOrderReceiptPdf(order: ReceiptOrder, paymentMethod?: string): Promise<void> {
  const bytes = buildOrderReceiptPdfBytes(order, paymentMethod);
  downloadPdfBytes(`kuitansi-${order.orderNumber}.pdf`, bytes);
}
