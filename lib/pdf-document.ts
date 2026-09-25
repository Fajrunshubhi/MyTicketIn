/** Minimal PDF 1.4 writer for letterhead-style documents (Helvetica / Helvetica-Bold). */

const PAGE_W = 595;
const PAGE_H = 842;

function pdfEscape(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

/** Strip glyphs Helvetica cannot encode. */
export function pdfLatin(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const HELV_W: Record<string, number> = {
  " ": 278,
  "!": 278,
  '"': 355,
  "#": 556,
  $: 556,
  "%": 889,
  "&": 667,
  "'": 191,
  "(": 333,
  ")": 333,
  "*": 389,
  "+": 584,
  ",": 278,
  "-": 333,
  ".": 278,
  "/": 278,
  "0": 556,
  "1": 556,
  "2": 556,
  "3": 556,
  "4": 556,
  "5": 556,
  "6": 556,
  "7": 556,
  "8": 556,
  "9": 556,
  ":": 278,
  ";": 278,
  "<": 584,
  "=": 584,
  ">": 584,
  "?": 556,
  "@": 1015,
  A: 667,
  B: 667,
  C: 722,
  D: 722,
  E: 667,
  F: 611,
  G: 778,
  H: 722,
  I: 278,
  J: 500,
  K: 667,
  L: 556,
  M: 833,
  N: 722,
  O: 778,
  P: 667,
  Q: 778,
  R: 722,
  S: 667,
  T: 611,
  U: 722,
  V: 667,
  W: 944,
  X: 667,
  Y: 667,
  Z: 611,
  "[": 278,
  "\\": 278,
  "]": 278,
  "^": 469,
  _: 556,
  "`": 333,
  a: 556,
  b: 556,
  c: 500,
  d: 556,
  e: 556,
  f: 278,
  g: 556,
  h: 556,
  i: 222,
  j: 222,
  k: 500,
  l: 222,
  m: 833,
  n: 556,
  o: 556,
  p: 556,
  q: 556,
  r: 333,
  s: 500,
  t: 278,
  u: 556,
  v: 500,
  w: 722,
  x: 500,
  y: 500,
  z: 500,
  "{": 334,
  "|": 260,
  "}": 334,
  "~": 584,
};

export function helveticaWidth(text: string, size: number): number {
  let w = 0;
  for (const ch of pdfLatin(text)) w += HELV_W[ch] ?? 500;
  return (w * size) / 1000;
}

export function wrapToWidth(text: string, size: number, maxWidth: number): string[] {
  const words = pdfLatin(text).split(" ").filter(Boolean);
  if (!words.length) return [""];
  const lines: string[] = [];
  let cur = "";
  for (const word of words) {
    const next = cur ? `${cur} ${word}` : word;
    if (helveticaWidth(next, size) > maxWidth && cur) {
      lines.push(cur);
      cur = word;
    } else {
      cur = next;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

export type PdfColor = { r: number; g: number; b: number };

export const PDF_INK: PdfColor = { r: 0.11, g: 0.086, b: 0.212 };
export const PDF_MUTED: PdfColor = { r: 0.38, g: 0.35, b: 0.48 };
export const PDF_BRAND: PdfColor = { r: 0.427, g: 0.29, b: 1 };
export const PDF_BRAND_DARK: PdfColor = { r: 0.231, g: 0.133, b: 0.659 };
export const PDF_PAPER: PdfColor = { r: 1, g: 1, b: 1 };
export const PDF_CANVAS: PdfColor = { r: 0.957, g: 0.945, b: 0.988 };
export const PDF_LINE: PdfColor = { r: 0.86, g: 0.84, b: 0.9 };
export const PDF_PAID: PdfColor = { r: 0.027, g: 0.463, b: 0.333 };
export const PDF_WARN: PdfColor = { r: 0.57, g: 0.25, b: 0.05 };

function rgb(c: PdfColor) {
  return `${c.r.toFixed(3)} ${c.g.toFixed(3)} ${c.b.toFixed(3)}`;
}

export class PdfDocument {
  private pages: string[][] = [[]];
  private jpegs: { name: string; data: Uint8Array; width: number; height: number }[] = [];

  get pageCount() {
    return this.pages.length;
  }

  get width() {
    return PAGE_W;
  }

  get height() {
    return PAGE_H;
  }

  addPage() {
    this.pages.push([]);
  }

  embedJpeg(data: Uint8Array, width: number, height: number): string {
    const name = `Im${this.jpegs.length}`;
    this.jpegs.push({ name, data, width, height });
    return name;
  }

  drawJpeg(name: string, x: number, y: number, w: number, h: number) {
    this.ops.push("q", `${n(w)} 0 0 ${n(h)} ${n(x)} ${n(y)} cm`, `/${name} Do`, "Q");
  }

  private get ops() {
    return this.pages[this.pages.length - 1];
  }

  fillRect(x: number, y: number, w: number, h: number, color: PdfColor) {
    this.ops.push(`${rgb(color)} rg`, `${n(x)} ${n(y)} ${n(w)} ${n(h)} re`, "f");
  }

  strokeRect(x: number, y: number, w: number, h: number, color: PdfColor, width = 0.8) {
    this.ops.push(`${n(width)} w`, `${rgb(color)} RG`, `${n(x)} ${n(y)} ${n(w)} ${n(h)} re`, "S");
  }

  line(x1: number, y1: number, x2: number, y2: number, color: PdfColor, width = 0.6) {
    this.ops.push(
      `${n(width)} w`,
      `${rgb(color)} RG`,
      `${n(x1)} ${n(y1)} m`,
      `${n(x2)} ${n(y2)} l`,
      "S",
    );
  }

  text(
    raw: string,
    x: number,
    y: number,
    opts: {
      size: number;
      bold?: boolean;
      color?: PdfColor;
      align?: "left" | "right" | "center";
      maxWidth?: number;
    },
  ): number {
    const size = opts.size;
    const color = opts.color || PDF_INK;
    const font = opts.bold ? "/F2" : "/F1";
    const lines = opts.maxWidth ? wrapToWidth(raw, size, opts.maxWidth) : [pdfLatin(raw)];
    const leading = size + 3;
    let yy = y;
    for (const line of lines) {
      let xx = x;
      const tw = helveticaWidth(line, size);
      if (opts.align === "right") xx = x - tw;
      if (opts.align === "center") xx = x - tw / 2;
      this.ops.push(
        "BT",
        `${font} ${n(size)} Tf`,
        `${rgb(color)} rg`,
        `1 0 0 1 ${n(xx)} ${n(yy)} Tm`,
        `(${pdfEscape(line)}) Tj`,
        "ET",
      );
      yy -= leading;
    }
    return lines.length * leading;
  }

  bytes(): Uint8Array {
    const objects: { dict: string; stream?: string | Uint8Array }[] = [
      { dict: "<< /Type /Catalog /Pages 2 0 R >>" },
      { dict: "<< /Type /Pages /Kids [] /Count 0 >>" },
      { dict: "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>" },
      { dict: "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>" },
    ];
    const xobjectParts: string[] = [];
    for (const img of this.jpegs) {
      const num = objects.length + 1;
      xobjectParts.push(`/${img.name} ${num} 0 R`);
      objects.push({
        dict: `<< /Type /XObject /Subtype /Image /Width ${img.width} /Height ${img.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.data.byteLength} >>`,
        stream: img.data,
      });
    }
    const xobj = xobjectParts.length ? ` /XObject << ${xobjectParts.join(" ")} >>` : "";
    const pageNums: number[] = [];
    for (const ops of this.pages) {
      const stream = ops.join("\n");
      const pageObj = objects.length + 1;
      const contentObj = pageObj + 1;
      pageNums.push(pageObj);
      objects.push({
        dict: `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Contents ${contentObj} 0 R /Resources << /Font << /F1 3 0 R /F2 4 0 R >>${xobj} >> >>`,
      });
      objects.push({ dict: `<< /Length ${stream.length} >>`, stream });
    }
    objects[1] = {
      dict: `<< /Type /Pages /Kids [${pageNums.map((pn) => `${pn} 0 R`).join(" ")}] /Count ${pageNums.length} >>`,
    };

    const enc = new TextEncoder();
    const chunks: Uint8Array[] = [enc.encode("%PDF-1.4\n")];
    const offsets = [0];
    let pos = chunks[0].byteLength;
    objects.forEach((obj, i) => {
      offsets.push(pos);
      const num = i + 1;
      if (obj.stream instanceof Uint8Array) {
        const head = enc.encode(`${num} 0 obj\n${obj.dict}\nstream\n`);
        const tail = enc.encode("\nendstream\nendobj\n");
        chunks.push(head, obj.stream, tail);
        pos += head.byteLength + obj.stream.byteLength + tail.byteLength;
        return;
      }
      if (typeof obj.stream === "string") {
        const body = enc.encode(`${num} 0 obj\n${obj.dict}\nstream\n${obj.stream}\nendstream\nendobj\n`);
        chunks.push(body);
        pos += body.byteLength;
        return;
      }
      const body = enc.encode(`${num} 0 obj\n${obj.dict}\nendobj\n`);
      chunks.push(body);
      pos += body.byteLength;
    });
    const xrefPos = pos;
    const count = objects.length + 1;
    let xref = `xref\n0 ${count}\n0000000000 65535 f \n`;
    for (let i = 1; i < count; i += 1) {
      xref += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
    }
    chunks.push(
      enc.encode(`${xref}trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`),
    );
    const total = chunks.reduce((s, c) => s + c.byteLength, 0);
    const out = new Uint8Array(total);
    let o = 0;
    for (const c of chunks) {
      out.set(c, o);
      o += c.byteLength;
    }
    return out;
  }
}

function n(v: number) {
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
}

export function downloadPdfBytes(fileName: string, bytes: Uint8Array) {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const blob = new Blob([copy.buffer], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function blobToJpeg(blob: Blob, width: number, height: number): Promise<Uint8Array> {
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Gambar gagal dimuat."));
      el.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas tidak tersedia.");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    const data = canvas.toDataURL("image/jpeg", 0.92).split(",")[1] || "";
    const bin = atob(data);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
    return out;
  } finally {
    URL.revokeObjectURL(url);
  }
}
