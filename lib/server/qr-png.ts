import { deflateSync } from "zlib";
import QRCode from "qrcode";
import { AppError } from "@/lib/server/http";

type QrModules = {
  size: number;
  get: (row: number, col: number) => number | boolean;
};

type QrLib = {
  create?: (text: string, opts: { errorCorrectionLevel: string }) => { modules: QrModules };
  default?: QrLib;
};

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePngRgba(width: number, height: number, rgba: Buffer): Buffer {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const src = y * width * 4;
    const dst = y * (width * 4 + 1);
    raw[dst] = 0;
    rgba.copy(raw, dst + 1, src, src + width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function createModules(token: string): QrModules {
  const mod = QRCode as unknown as QrLib;
  const create = mod.create || mod.default?.create;
  if (typeof create !== "function") {
    throw new AppError("TICKET_CRYPTO_FAILED", "Kode QR tidak dapat ditampilkan.", {}, 500);
  }
  return create(token, { errorCorrectionLevel: "M" }).modules;
}

export async function renderTicketQrPng(token: string): Promise<Buffer> {
  try {
    const modules = createModules(token);
    const margin = 4;
    const n = modules.size + margin * 2;
    const scale = Math.max(1, Math.floor(320 / n));
    const dim = n * scale;
    const rgba = Buffer.alloc(dim * dim * 4, 255);
    for (let row = 0; row < modules.size; row += 1) {
      for (let col = 0; col < modules.size; col += 1) {
        if (!modules.get(row, col)) continue;
        const x0 = (col + margin) * scale;
        const y0 = (row + margin) * scale;
        for (let dy = 0; dy < scale; dy += 1) {
          for (let dx = 0; dx < scale; dx += 1) {
            const i = ((y0 + dy) * dim + (x0 + dx)) * 4;
            rgba[i] = 0x11;
            rgba[i + 1] = 0x11;
            rgba[i + 2] = 0x11;
            rgba[i + 3] = 255;
          }
        }
      }
    }
    return encodePngRgba(dim, dim, rgba);
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError("TICKET_CRYPTO_FAILED", "Kode QR tidak dapat ditampilkan.", {}, 500);
  }
}
