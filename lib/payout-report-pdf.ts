import { formatDateLong, formatDateTime, formatRupiah } from "@/lib/format";
import { refundSourceUiLabel } from "@/lib/order-refund-display";
import { withPayoutReportDocument } from "@/lib/payout-report-integrity";
import { ticketStatusLabel, type PayoutReport } from "@/lib/payout-report";
import { platformDocumentIssuer } from "@/lib/platform-document";
import {
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

const MARGIN = 40;
const HEADER_H = 96;
const FOOTER_H = 58;
const CONTENT_BOTTOM = FOOTER_H + 16;

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

function issuerRows(): string[] {
  const issuer = platformDocumentIssuer();
  const lines = [issuer.name, issuer.tagline];
  if (issuer.address) lines.push(issuer.address);
  const contact = [issuer.email, issuer.phone].filter(Boolean).join("  |  ");
  if (contact) lines.push(contact);
  if (issuer.nib) lines.push(`NIB ${issuer.nib}`);
  if (issuer.npwp) lines.push(`NPWP ${issuer.npwp}`);
  return lines;
}

function payoutStamp(status?: string | null): { label: string; color: PdfColor } {
  if (status === "PAID") return { label: "DICAIRKAN", color: PDF_PAID };
  if (status === "REQUESTED") return { label: "DIAJUKAN", color: PDF_BRAND_DARK };
  return { label: "BELUM DIAJUKAN", color: PDF_WARN };
}

function drawStamp(doc: PdfDocument, label: string, color: PdfColor, x: number, y: number) {
  const size = 10;
  const boxW = helveticaWidth(label, size) + 18;
  const boxH = 20;
  doc.strokeRect(x, y, boxW, boxH, color, 1.5);
  doc.text(label, x + boxW / 2, y + 6, { size, bold: true, color, align: "center" });
  return boxW;
}

function legalNotes(report: PayoutReport, net: number): string[] {
  const notes = [
    "Diterbitkan secara elektronik oleh sistem MyTicketIn. Informasi elektronik dan hasil cetaknya merupakan alat bukti yang sah sepanjang dapat diakses, ditampilkan, dijamin keutuhannya, dan dipertanggungjawabkan (UU ITE Pasal 5 dan Pasal 6).",
    "Dokumen ini adalah laporan rekapitulasi penjualan dan lampiran pendukung pencairan penyelenggara. Bukan faktur pajak, bukan bukti potong PPh, dan bukan bukti pemungutan PPN.",
    "Pembayaran pembeli diterima penyedia jasa pembayaran (akun merchant platform). Nominal net = penjualan order Lunas/Direfund dikurangi refund berstatus Selesai, dihitung ulang dari basis data, bukan saldo tersimpan.",
    "Biodata pemegang tiket, termasuk NIK, bersifat rahasia sesuai UU Pelindungan Data Pribadi dan hanya untuk data dukung pencairan.",
  ];
  if (report.holders.length < report.ticketCount) {
    notes.push(`Daftar pemegang ditampilkan ${report.holders.length} dari ${report.ticketCount} tiket.`);
  }
  if (net > STAMP_DUTY_THRESHOLD_RUPIAH) {
    notes.push(
      "Nilai net lebih dari Rp5.000.000. Jika dokumen dipakai sebagai alat bukti, bea meterai Rp10.000 dapat dilengkapi dengan meterai elektronik sesuai UU 10/2020.",
    );
  }
  notes.push("Simpan file ini bersama bukti transfer. Selisih dicocokkan dengan nomor order dan nomor tiket pada lampiran.");
  return notes;
}

function drawChrome(
  doc: PdfDocument,
  report: PayoutReport,
  page: number,
  pages: number,
  printedAt: string,
) {
  const w = doc.width;
  const h = doc.height;
  const issuer = platformDocumentIssuer();
  doc.fillRect(0, h - 8, w, 8, PDF_BRAND_DARK);
  doc.fillRect(MARGIN, h - 42, 26, 26, PDF_BRAND);
  doc.text("MT", MARGIN + 13, h - 34, { size: 8, bold: true, color: PDF_PAPER, align: "center" });
  doc.text(issuer.name.toUpperCase(), MARGIN + 38, h - 26, { size: 13, bold: true, color: PDF_INK });
  doc.text(issuer.tagline, MARGIN + 38, h - 42, { size: 7.5, color: PDF_MUTED, maxWidth: 340 });
  const kop = [issuer.address, issuer.email, issuer.phone].filter(Boolean).join("  |  ");
  if (kop) {
    doc.text(kop, MARGIN + 38, h - 56, { size: 7, color: PDF_MUTED, maxWidth: 340 });
  }
  const ids = [issuer.nib ? `NIB ${issuer.nib}` : "", issuer.npwp ? `NPWP ${issuer.npwp}` : ""].filter(Boolean).join("  |  ");
  if (ids) {
    doc.text(ids, MARGIN + 38, h - 68, { size: 7, color: PDF_MUTED, maxWidth: 340 });
  }
  doc.text("RAHASIA", w - MARGIN, h - 28, { size: 9, bold: true, color: PDF_WARN, align: "right" });
  doc.text("Data dukung pencairan", w - MARGIN, h - 42, { size: 7, color: PDF_MUTED, align: "right" });
  doc.line(MARGIN, h - HEADER_H + 8, w - MARGIN, h - HEADER_H + 8, PDF_BRAND_DARK, 1.2);
  doc.line(MARGIN, h - HEADER_H + 5, w - MARGIN, h - HEADER_H + 5, PDF_LINE, 0.5);

  doc.fillRect(0, 0, w, FOOTER_H, PDF_CANVAS);
  doc.line(MARGIN, FOOTER_H, w - MARGIN, FOOTER_H, PDF_LINE, 0.6);
  doc.text("Rahasia  |  Bukan faktur pajak  |  Diterbitkan elektronik sesuai UU ITE", MARGIN, 36, {
    size: 7,
    color: PDF_MUTED,
  });
  if (report.integrityHash) {
    doc.text(`SHA-256 ${report.integrityHash.slice(0, 32)}`, MARGIN, 24, { size: 6.5, color: PDF_MUTED });
  }
  doc.text(`Dicetak ${printedAt}`, MARGIN, 12, { size: 7, color: PDF_MUTED });
  doc.text(`${report.documentNumber || report.payoutNumber || "LPP"}  |  Hal. ${page}/${pages}`, w - MARGIN, 24, {
    size: 7,
    color: PDF_MUTED,
    align: "right",
  });
}

export function buildPayoutReportPdfBytes(input: PayoutReport): Uint8Array {
  const report = withPayoutReportDocument(input);
  const printedAt = when(report.generatedAt, report.timezone);
  const right = 595 - MARGIN;
  const innerW = right - MARGIN;
  const tz = report.timezone || "Asia/Jakarta";
  const net = report.payoutAmountRupiah ?? report.netRupiah;
  const stamp = payoutStamp(report.payoutStatus);
  const fromRows = issuerRows();
  const toRows = [
    report.organizerName,
    "Penyelenggara event / penerima pencairan",
    report.bankName ? `Bank ${report.bankName}` : "",
    report.bankAccountName ? `a.n. ${report.bankAccountName}` : "",
    report.bankAccountMasked ? `No. rek. ${report.bankAccountMasked}` : "",
  ].filter(Boolean);
  const half = (innerW - 12) / 2;
  const notes = legalNotes(report, net);
  let terbilang = "nol rupiah";
  try {
    terbilang = terbilangRupiah(Math.max(0, Math.trunc(net)));
  } catch {
    terbilang = "nol rupiah";
  }

  type Block =
    | { kind: "title" }
    | { kind: "meta" }
    | { kind: "parties" }
    | { kind: "event" }
    | { kind: "finance" }
    | { kind: "refundHead" }
    | { kind: "refund"; number: string; order: string; source: string; amount: string }
    | { kind: "holderHead" }
    | {
        kind: "holder";
        name: string;
        identity: string;
        ticket: string;
        detail: string;
        status: string;
        price: string;
        refund: string;
      }
    | { kind: "notes" };

  const blocks: Block[] = [{ kind: "title" }, { kind: "meta" }, { kind: "parties" }, { kind: "event" }, { kind: "finance" }];
  if (report.refunds.length > 0) {
    blocks.push({ kind: "refundHead" });
    for (const rf of report.refunds) {
      blocks.push({
        kind: "refund",
        number: rf.refundNumber,
        order: rf.orderNumber,
        source: refundSourceUiLabel(rf.source) || "-",
        amount: money(rf.amountRupiah),
      });
    }
  }
  blocks.push({ kind: "holderHead" });
  for (const h of report.holders) {
    const seat = [h.ticketTypeName, h.sectionName, h.seatLabel].filter(Boolean).join(" / ");
    const identity = [h.holderEmail, h.holderPhone, h.holderIdentityNumber ? `NIK ${h.holderIdentityNumber}` : ""]
      .filter(Boolean)
      .join("  |  ");
    blocks.push({
      kind: "holder",
      name: h.holderName || "-",
      identity,
      ticket: h.ticketNumber,
      detail: [h.orderNumber, seat].filter(Boolean).join(" / "),
      status: ticketStatusLabel(h.ticketStatus),
      price: money(h.unitPriceRupiah),
      refund: h.orderRefundedRupiah > 0 ? money(h.orderRefundedRupiah) : "",
    });
  }
  blocks.push({ kind: "notes" });

  function partyH() {
    const line = (rows: string[]) => rows.reduce((sum, row) => sum + wrapToWidth(row, 8, half - 20).length * 11, 28);
    return Math.max(line(fromRows), line(toRows), 72);
  }

  function measure(block: Block): number {
    if (block.kind === "title") return 58;
    if (block.kind === "meta") return 58;
    if (block.kind === "parties") return partyH() + 14;
    if (block.kind === "event") return 56;
    if (block.kind === "finance") return 108;
    if (block.kind === "refundHead") return 36;
    if (block.kind === "refund") return 18;
    if (block.kind === "holderHead") return 36;
    if (block.kind === "holder") {
      const nameH = wrapToWidth(block.name, 8.5, 230).length * 11;
      const idH = wrapToWidth(block.identity, 7.5, 230).length * 10;
      return 12 + Math.max(nameH + idH, 24, block.refund ? 34 : 24);
    }
    if (block.kind === "notes") {
      let h = 16;
      for (const note of notes) h += wrapToWidth(`-  ${note}`, 8, innerW).length * 11 + 2;
      return h + 78;
    }
    return 78;
  }

  const pages: Block[][] = [[]];
  let used = 0;
  const budget = 842 - HEADER_H - CONTENT_BOTTOM - 12;
  for (const block of blocks) {
    const h = measure(block);
    if (used + h > budget && pages[pages.length - 1].length > 0) {
      const start: Block[] = [];
      if (block.kind === "holder") start.push({ kind: "holderHead" });
      if (block.kind === "refund") start.push({ kind: "refundHead" });
      pages.push(start);
      used = start.reduce((s, b) => s + measure(b), 0);
    }
    pages[pages.length - 1].push(block);
    used += h;
  }

  const doc = new PdfDocument();
  for (let p = 0; p < pages.length; p += 1) {
    if (p > 0) doc.addPage();
    drawChrome(doc, report, p + 1, pages.length, printedAt);
    let y = 842 - HEADER_H - 12;

    for (const block of pages[p]) {
      if (block.kind === "title") {
        doc.text("LAPORAN REKAPITULASI PENJUALAN", MARGIN, y, { size: 13, bold: true, color: PDF_INK });
        const stampW = helveticaWidth(stamp.label, 10) + 18;
        drawStamp(doc, stamp.label, stamp.color, right - stampW, y - 12);
        y -= 16;
        doc.text("Lampiran pendukung pencairan dana penyelenggara", MARGIN, y, {
          size: 8.5,
          color: PDF_MUTED,
          maxWidth: innerW - stampW - 12,
        });
        y -= 22;
      }
      if (block.kind === "meta") {
        doc.fillRect(MARGIN, y - 42, innerW, 48, PDF_CANVAS);
        const cols = [
          ["Nomor dokumen", report.documentNumber || "-"],
          ["Tanggal terbit", placeDate(report.generatedAt)],
          ["Nomor pencairan", report.payoutNumber || "Belum diajukan"],
        ];
        const colW = innerW / 3;
        cols.forEach((col, i) => {
          const x = MARGIN + i * colW + 10;
          doc.text(col[0], x, y - 12, { size: 7, bold: true, color: PDF_MUTED });
          doc.text(col[1], x, y - 28, { size: 8, bold: true, maxWidth: colW - 16 });
        });
        y -= 56;
      }
      if (block.kind === "parties") {
        const boxH = partyH();
        doc.strokeRect(MARGIN, y - boxH, half, boxH, PDF_LINE, 0.8);
        doc.strokeRect(MARGIN + half + 12, y - boxH, half, boxH, PDF_LINE, 0.8);
        doc.text("DITERBITKAN OLEH", MARGIN + 10, y - 14, { size: 7, bold: true, color: PDF_MUTED });
        let ly = y - 30;
        fromRows.forEach((row, i) => {
          ly -= doc.text(row, MARGIN + 10, ly, {
            size: i === 0 ? 10 : 8,
            bold: i === 0,
            color: i === 0 ? PDF_INK : PDF_MUTED,
            maxWidth: half - 20,
          });
        });
        doc.text("DITUJUKAN KEPADA", MARGIN + half + 22, y - 14, { size: 7, bold: true, color: PDF_MUTED });
        let ry = y - 30;
        toRows.forEach((row, i) => {
          ry -= doc.text(row, MARGIN + half + 22, ry, {
            size: i === 0 ? 10 : 8,
            bold: i === 0,
            color: i === 0 ? PDF_INK : PDF_MUTED,
            maxWidth: half - 20,
          });
        });
        y -= boxH + 14;
      }
      if (block.kind === "event") {
        doc.text("EVENT", MARGIN, y, { size: 7, bold: true, color: PDF_MUTED });
        y -= 14;
        doc.text(report.eventTitle, MARGIN, y, { size: 10, bold: true, maxWidth: innerW });
        y -= 14;
        doc.text(report.venueLine || "-", MARGIN, y, { size: 8, color: PDF_MUTED, maxWidth: innerW });
        y -= 12;
        doc.text(`Mulai ${when(report.startsAt, tz)}  |  Selesai ${when(report.endsAt, tz)}`, MARGIN, y, {
          size: 8,
          color: PDF_MUTED,
          maxWidth: innerW,
        });
        y -= 16;
      }
      if (block.kind === "finance") {
        const cols = [
          ["Penjualan lunas", money(report.grossRupiah)],
          ["Refund selesai", `- ${money(report.refundedRupiah)}`],
          ["Net pencairan", money(net)],
        ];
        const colW = innerW / 3;
        doc.fillRect(MARGIN, y - 52, innerW, 56, PDF_CANVAS);
        cols.forEach((col, i) => {
          const x = MARGIN + i * colW + 10;
          doc.text(col[0], x, y - 14, { size: 7.5, color: PDF_MUTED });
          doc.text(col[1], x, y - 32, { size: 11, bold: true });
        });
        y -= 64;
        doc.text(`Terbilang: ${terbilang}`, MARGIN, y, { size: 8.5, bold: true, maxWidth: innerW });
        y -= 14;
        doc.text(`${report.paidOrderCount} order lunas  |  ${report.ticketCount} tiket`, MARGIN, y, {
          size: 8,
          color: PDF_MUTED,
        });
        y -= 18;
      }
      if (block.kind === "refundHead") {
        doc.text("REFUND SELESAI", MARGIN, y, { size: 8, bold: true, color: PDF_MUTED });
        y -= 16;
        doc.fillRect(MARGIN, y - 4, innerW, 16, PDF_CANVAS);
        doc.text("NOMOR", MARGIN + 6, y, { size: 7, bold: true, color: PDF_MUTED });
        doc.text("ORDER", MARGIN + 150, y, { size: 7, bold: true, color: PDF_MUTED });
        doc.text("SUMBER", MARGIN + 280, y, { size: 7, bold: true, color: PDF_MUTED });
        doc.text("NOMINAL", right - 6, y, { size: 7, bold: true, color: PDF_MUTED, align: "right" });
        y -= 20;
      }
      if (block.kind === "refund") {
        doc.text(block.number, MARGIN + 6, y, { size: 8, maxWidth: 140 });
        doc.text(block.order, MARGIN + 150, y, { size: 8, maxWidth: 120 });
        doc.text(block.source, MARGIN + 280, y, { size: 8, maxWidth: 140 });
        doc.text(block.amount, right - 6, y, { size: 8, align: "right" });
        y -= 18;
      }
      if (block.kind === "holderHead") {
        doc.text("BIODATA PEMEGANG TIKET", MARGIN, y, { size: 8, bold: true, color: PDF_MUTED });
        y -= 16;
        doc.fillRect(MARGIN, y - 4, innerW, 16, PDF_CANVAS);
        doc.text("PEMEGANG", MARGIN + 6, y, { size: 7, bold: true, color: PDF_MUTED });
        doc.text("TIKET / ORDER", MARGIN + 250, y, { size: 7, bold: true, color: PDF_MUTED });
        doc.text("STATUS", MARGIN + 400, y, { size: 7, bold: true, color: PDF_MUTED });
        doc.text("HARGA", right - 6, y, { size: 7, bold: true, color: PDF_MUTED, align: "right" });
        y -= 20;
      }
      if (block.kind === "holder") {
        const nameH = doc.text(block.name, MARGIN + 6, y, { size: 8.5, bold: true, maxWidth: 230 });
        doc.text(block.identity, MARGIN + 6, y - nameH + 2, { size: 7.5, color: PDF_MUTED, maxWidth: 230 });
        doc.text(block.ticket, MARGIN + 250, y, { size: 8, maxWidth: 140 });
        doc.text(block.detail, MARGIN + 250, y - 12, { size: 7.5, color: PDF_MUTED, maxWidth: 140 });
        doc.text(block.status, MARGIN + 400, y, { size: 8, maxWidth: 70 });
        doc.text(block.price, right - 6, y, { size: 8, bold: true, align: "right" });
        if (block.refund) {
          doc.text(`Refund ${block.refund}`, right - 6, y - 12, { size: 7, color: PDF_MUTED, align: "right" });
        }
        y -= measure(block);
        doc.line(MARGIN, y + 6, right, y + 6, PDF_LINE, 0.35);
      }
      if (block.kind === "notes") {
        doc.text("KETERANGAN HUKUM DAN PENGGUNAAN", MARGIN, y, { size: 8, bold: true, color: PDF_MUTED });
        y -= 14;
        for (const note of notes) {
          const h = doc.text(`-  ${note}`, MARGIN, y, { size: 8, color: PDF_MUTED, maxWidth: innerW });
          y -= h + 2;
        }
        y -= 8;
        doc.line(MARGIN, y + 4, right, y + 4, PDF_LINE, 0.5);
        y -= 14;
        doc.text(placeDate(report.generatedAt), MARGIN, y, { size: 8 });
        y -= 12;
        doc.text("Diterbitkan secara elektronik oleh sistem MyTicketIn", MARGIN, y, { size: 8, bold: true });
        y -= 12;
        doc.text("Penyelenggara Sistem Elektronik  |  tanpa tanda tangan basah", MARGIN, y, {
          size: 7.5,
          color: PDF_MUTED,
        });
        y -= 12;
        if (report.verifyUrl) {
          doc.text(`Verifikasi: ${report.verifyUrl}`, MARGIN, y, { size: 7.5, color: PDF_MUTED, maxWidth: innerW });
        }
      }
    }
  }
  return doc.bytes();
}
