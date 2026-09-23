function pdfEscape(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function wrapLines(text: string, max = 86): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length > max) {
      if (cur) lines.push(cur);
      cur = w;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [""];
}

export async function downloadTicketPdf(input: {
  fileName: string;
  lines: string[];
  qrBlob: Blob | null;
}): Promise<void> {
  const jpeg = input.qrBlob ? await blobToJpeg(input.qrBlob, 320, 320) : null;
  const text: string[] = ["BT", "/F1 12 Tf", "50 800 Td", "16 TL"];
  let first = true;
  for (const raw of input.lines) {
    for (const line of wrapLines(raw)) {
      if (!first) text.push("T*");
      first = false;
      text.push(`(${pdfEscape(line)}) Tj`);
    }
  }
  text.push("ET");
  if (jpeg) {
    text.push("q", "200 0 0 200 197 72 cm", "/Im0 Do", "Q");
  }
  const stream = text.join("\n");

  const objects: { dict: string; stream?: Uint8Array | string }[] = [
    { dict: "<< /Type /Catalog /Pages 2 0 R >>" },
    { dict: "<< /Type /Pages /Kids [3 0 R] /Count 1 >>" },
    {
      dict: jpeg
        ? "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> /XObject << /Im0 6 0 R >> >> >>"
        : "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    },
    { dict: `<< /Length ${stream.length} >>`, stream },
    { dict: "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>" },
  ];
  if (jpeg) {
    objects.push({
      dict: `<< /Type /XObject /Subtype /Image /Width 320 /Height 320 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.byteLength} >>`,
      stream: jpeg,
    });
  }

  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [enc.encode("%PDF-1.4\n")];
  const offsets = [0];
  let pos = chunks[0].byteLength;
  objects.forEach((obj, i) => {
    offsets.push(pos);
    const n = i + 1;
    if (obj.stream instanceof Uint8Array) {
      const head = enc.encode(`${n} 0 obj\n${obj.dict}\nstream\n`);
      const tail = enc.encode("\nendstream\nendobj\n");
      chunks.push(head, obj.stream, tail);
      pos += head.byteLength + obj.stream.byteLength + tail.byteLength;
      return;
    }
    if (typeof obj.stream === "string") {
      const body = enc.encode(`${n} 0 obj\n${obj.dict}\nstream\n${obj.stream}\nendstream\nendobj\n`);
      chunks.push(body);
      pos += body.byteLength;
      return;
    }
    const body = enc.encode(`${n} 0 obj\n${obj.dict}\nendobj\n`);
    chunks.push(body);
    pos += body.byteLength;
  });
  const xrefPos = pos;
  const count = objects.length + 1;
  let xref = `xref\n0 ${count}\n0000000000 65535 f \n`;
  for (let i = 1; i < count; i += 1) {
    xref += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  chunks.push(enc.encode(`${xref}trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`));
  const blob = new Blob(chunks as BlobPart[], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = input.fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function blobToJpeg(blob: Blob, width: number, height: number): Promise<Uint8Array> {
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Gambar QR gagal dimuat."));
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
