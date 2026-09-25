import { formatCheckInBefore, formatDateTime } from "@/lib/format";
import {
  blobToJpeg,
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
  type PdfColor,
} from "@/lib/pdf-document";

export type EventTicketPdf = {
  ticketNumber: string;
  manualCode: string;
  status: string;
  eventTitle: string;
  venueLine: string;
  startsAt?: string | null;
  timezone?: string;
  ticketTypeName?: string;
  sectionName?: string;
  seatLabel?: string;
  orderNumber?: string;
  holderName?: string;
  holderEmail?: string;
  holderPhone?: string;
  holderNik?: string;
};

const STATUS_LABEL: Record<string, string> = {
  UNUSED: "Siap dipakai",
  USED: "Sudah check-in",
  CANCELLED: "Dibatalkan",
};

function stampLabel(status: string) {
  if (status === "UNUSED") return "SIAP DIPAKAI";
  if (status === "USED") return "SUDAH CHECK-IN";
  if (status === "CANCELLED") return "DIBATALKAN";
  return status;
}

function stampColor(status: string): PdfColor {
  if (status === "UNUSED") return PDF_BRAND_DARK;
  if (status === "USED") return PDF_PAID;
  return PDF_MUTED;
}

function maskNik(raw?: string) {
  const n = String(raw || "").replace(/\D/g, "");
  if (n.length < 4) return "";
  return `${"x".repeat(Math.max(0, n.length - 4))}${n.slice(-4)}`;
}

function when(iso?: string | null, tz?: string) {
  if (!iso) return "-";
  try {
    return pdfLatin(formatDateTime(iso, tz || "Asia/Jakarta"));
  } catch {
    return "-";
  }
}

function checkInLine(iso?: string | null, tz?: string) {
  if (!iso) return "";
  try {
    return pdfLatin(formatCheckInBefore(iso, tz || "Asia/Jakarta"));
  } catch {
    return "";
  }
}

export function buildEventTicketPdfBytes(ticket: EventTicketPdf, qrJpeg?: Uint8Array | null): Uint8Array {
  const doc = new PdfDocument();
  const w = doc.width;
  const h = doc.height;
  const margin = 40;
  const right = w - margin;
  const innerW = right - margin;
  const cancelled = ticket.status === "CANCELLED";
  const printedAt = when(new Date().toISOString());
  const checkIn = checkInLine(ticket.startsAt, ticket.timezone);
  const nik = maskNik(ticket.holderNik);

  doc.fillRect(0, h - 72, w, 72, PDF_BRAND_DARK);
  doc.fillRect(margin, h - 54, 28, 28, PDF_BRAND);
  doc.text("MT", margin + 14, h - 45, { size: 9, bold: true, color: PDF_PAPER, align: "center" });
  doc.text("MYTICKETIN", margin + 40, h - 38, { size: 16, bold: true, color: PDF_PAPER });
  doc.text("Event Ticketing  |  E-tiket digital", margin + 40, h - 54, {
    size: 8,
    color: { r: 0.85, g: 0.82, b: 0.98 },
  });

  doc.fillRect(0, 0, w, 52, PDF_CANVAS);
  doc.line(margin, 52, right, 52, PDF_LINE, 0.6);
  doc.text("MyTicketIn  ·  E-tiket  ·  Tunjukkan QR hanya kepada petugas check-in", margin, 28, {
    size: 7.5,
    color: PDF_MUTED,
  });
  doc.text(`Dicetak ${printedAt}`, margin, 16, { size: 7.5, color: PDF_MUTED });
  doc.text(`${ticket.ticketNumber}  ·  Hal. 1/1`, right, 22, { size: 7.5, color: PDF_MUTED, align: "right" });

  let y = h - 92;
  const bannerPaid = ticket.status === "UNUSED";
  doc.fillRect(margin, y - 24, innerW, 32, bannerPaid ? { r: 0.9, g: 0.97, b: 0.93 } : PDF_CANVAS);
  doc.text(
    cancelled
      ? "TIKET DIBATALKAN  ·  Kode QR tidak disertakan pada dokumen ini."
      : "E-TIKET SANDBOX  ·  QR hanya berisi token check-in, bukan data pribadi.",
    margin + 10,
    y - 10,
    { size: 7.5, color: cancelled ? PDF_WARN : PDF_PAID, maxWidth: innerW - 20 },
  );
  y -= 48;

  doc.text("E-TIKET", margin, y, { size: 18, bold: true, color: PDF_INK });
  const stamp = stampLabel(ticket.status);
  const stampW = helveticaWidth(stamp, 11) + 20;
  const color = stampColor(ticket.status);
  doc.strokeRect(right - stampW, y - 10, stampW, 22, color, 1.6);
  doc.text(stamp, right - stampW / 2, y - 3, { size: 11, bold: true, color, align: "center" });
  y -= 28;
  doc.text(ticket.eventTitle || "Event", margin, y, { size: 14, bold: true, maxWidth: innerW - stampW - 12 });
  y -= 22;
  if (ticket.venueLine) {
    const used = doc.text(ticket.venueLine, margin, y, { size: 9, color: PDF_MUTED, maxWidth: innerW });
    y -= used + 2;
  }
  doc.text(`Waktu  ${when(ticket.startsAt, ticket.timezone)}`, margin, y, { size: 9, color: PDF_MUTED, maxWidth: innerW });
  y -= 14;
  if (checkIn) {
    doc.text(checkIn, margin, y, { size: 9, color: PDF_MUTED, maxWidth: innerW });
    y -= 18;
  } else {
    y -= 8;
  }

  const qrColW = 210;
  const leftW = innerW - qrColW - 14;
  const boxTop = y;
  const qrBoxH = 310;
  doc.strokeRect(margin, y - qrBoxH, leftW, qrBoxH, PDF_LINE, 0.8);
  doc.fillRect(margin + leftW + 14, y - qrBoxH, qrColW, qrBoxH, PDF_CANVAS);
  doc.strokeRect(margin + leftW + 14, y - qrBoxH, qrColW, qrBoxH, PDF_LINE, 0.8);

  let ly = y - 16;
  const field = (label: string, value: string) => {
    doc.text(label, margin + 12, ly, { size: 7.5, bold: true, color: PDF_MUTED });
    ly -= 12;
    const used = doc.text(value || "-", margin + 12, ly, { size: 10, bold: true, maxWidth: leftW - 24 });
    ly -= used + 8;
  };
  field("JENIS TIKET", ticket.ticketTypeName || "-");
  field("KURSI / ZONA", ticket.seatLabel || ticket.sectionName || "Tanpa nomor kursi");
  field("PEMEGANG", ticket.holderName || "-");
  if (ticket.holderEmail) field("EMAIL", ticket.holderEmail);
  if (ticket.holderPhone) field("NOMOR HP", ticket.holderPhone);
  if (nik) field("NIK", nik);
  field("NOMOR TIKET", ticket.ticketNumber);
  if (ticket.orderNumber) field("ORDER", ticket.orderNumber);

  const qx = margin + leftW + 14;
  doc.text("MASUK VENUE", qx + qrColW / 2, boxTop - 16, {
    size: 7.5,
    bold: true,
    color: PDF_MUTED,
    align: "center",
  });
  if (!cancelled && qrJpeg && qrJpeg.byteLength > 0) {
    const img = doc.embedJpeg(qrJpeg, 320, 320);
    const qSize = 150;
    const qx0 = qx + (qrColW - qSize) / 2;
    const qy0 = boxTop - 28 - qSize;
    doc.fillRect(qx0 - 8, qy0 - 8, qSize + 16, qSize + 16, PDF_PAPER);
    doc.drawJpeg(img, qx0, qy0, qSize, qSize);
    doc.text("Tunjukkan kepada petugas", qx + qrColW / 2, qy0 - 18, {
      size: 8,
      color: PDF_MUTED,
      align: "center",
    });
    if (ticket.status === "USED") {
      doc.text("Sudah check-in", qx + qrColW / 2, qy0 - 32, {
        size: 8,
        bold: true,
        color: PDF_PAID,
        align: "center",
      });
    }
  } else if (cancelled) {
    doc.text("QR tidak ditampilkan", qx + qrColW / 2, boxTop - 120, {
      size: 9,
      color: PDF_MUTED,
      align: "center",
    });
  } else {
    doc.text("QR tidak tersedia", qx + qrColW / 2, boxTop - 120, {
      size: 9,
      color: PDF_MUTED,
      align: "center",
    });
  }

  y = boxTop - qrBoxH - 16;
  doc.fillRect(margin, y - 36, innerW, 36, PDF_CANVAS);
  doc.text("KODE CADANGAN", margin + 12, y - 12, { size: 7.5, bold: true, color: PDF_MUTED });
  doc.text(ticket.manualCode || "-", margin + 12, y - 26, { size: 11, bold: true });
  y -= 52;

  doc.text("KETERANGAN", margin, y, { size: 8, bold: true, color: PDF_MUTED });
  y -= 14;
  const notes = [
    "Dokumen ini adalah e-tiket MyTicketIn. Satu tiket paling banyak untuk satu check-in berhasil.",
    "Jangan membagikan berkas ini. QR dan kode cadangan setara dengan tiket fisik.",
    "NIK pada PDF dipotong (4 digit terakhir) untuk mengurangi risiko kebocoran data.",
  ];
  for (const note of notes) {
    const used = doc.text(`-  ${note}`, margin, y, { size: 8, color: PDF_MUTED, maxWidth: innerW });
    y -= used + 2;
  }

  return doc.bytes();
}

export async function downloadEventTicketPdf(ticket: EventTicketPdf, qrBlob: Blob | null): Promise<void> {
  const jpeg = qrBlob ? await blobToJpeg(qrBlob, 320, 320) : null;
  const bytes = buildEventTicketPdfBytes(ticket, jpeg);
  downloadPdfBytes(`tiket-${ticket.ticketNumber}.pdf`, bytes);
}
