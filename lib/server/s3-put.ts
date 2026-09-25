import { createHash, createHmac } from "crypto";
import { AppError } from "@/lib/server/http";

export type GalleryStorageConfig = {
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  endpoint: string;
  region: string;
  publicBase: string;
};

export function galleryStorageConfig(): GalleryStorageConfig | null {
  const bucket = String(process.env.GALLERY_S3_BUCKET || "").trim();
  const accessKeyId = String(process.env.AWS_ACCESS_KEY_ID || "").trim();
  const secretAccessKey = String(process.env.AWS_SECRET_ACCESS_KEY || "").trim();
  const endpoint = String(process.env.AWS_ENDPOINT_URL_S3 || process.env.GALLERY_S3_ENDPOINT || "")
    .trim()
    .replace(/\/$/, "");
  const region = String(process.env.AWS_REGION || process.env.GALLERY_S3_REGION || "auto").trim() || "auto";
  const publicBase = String(process.env.GALLERY_S3_PUBLIC_BASE_URL || "").trim().replace(/\/$/, "");
  if (!bucket || !accessKeyId || !secretAccessKey || !endpoint) return null;
  return { bucket, accessKeyId, secretAccessKey, endpoint, region, publicBase };
}

export function publicObjectUrl(cfg: GalleryStorageConfig, key: string): string {
  if (cfg.publicBase) return `${cfg.publicBase}/${key}`;
  return `${cfg.endpoint}/${cfg.bucket}/${key}`;
}

function sha256Hex(data: Buffer | string): string {
  return createHash("sha256").update(data).digest("hex");
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data, "utf8").digest();
}

function amzDateParts(at: Date): { amzDate: string; dateStamp: string } {
  const iso = at.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const amzDate = `${iso.slice(0, 15)}Z`;
  return { amzDate, dateStamp: amzDate.slice(0, 8) };
}

function encodePath(path: string): string {
  return path
    .split("/")
    .map((part) => encodeURIComponent(part).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`))
    .join("/");
}

export function s3PutRequest(
  cfg: GalleryStorageConfig,
  key: string,
  body: Buffer,
  contentType: string,
  at: Date,
): { url: string; headers: Record<string, string> } {
  const url = new URL(`${cfg.endpoint}/${cfg.bucket}/${key}`);
  const host = url.host;
  const canonicalUri = encodePath(`/${cfg.bucket}/${key}`);
  const payloadHash = sha256Hex(body);
  const { amzDate, dateStamp } = amzDateParts(at);
  const canonicalHeaders =
    `content-type:${contentType}\n` + `host:${host}\n` + `x-amz-content-sha256:${payloadHash}\n` + `x-amz-date:${amzDate}\n`;
  const signedHeaders = "content-type;host;x-amz-content-sha256;x-amz-date";
  const canonicalRequest = ["PUT", canonicalUri, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const scope = `${dateStamp}/${cfg.region}/s3/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256Hex(canonicalRequest)].join("\n");
  const dateKey = hmac(`AWS4${cfg.secretAccessKey}`, dateStamp);
  const regionKey = hmac(dateKey, cfg.region);
  const serviceKey = hmac(regionKey, "s3");
  const signingKey = hmac(serviceKey, "aws4_request");
  const signature = createHmac("sha256", signingKey).update(stringToSign, "utf8").digest("hex");
  return {
    url: url.toString(),
    headers: {
      Authorization: `AWS4-HMAC-SHA256 Credential=${cfg.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
      "Content-Type": contentType,
      Host: host,
      "X-Amz-Content-Sha256": payloadHash,
      "X-Amz-Date": amzDate,
    },
  };
}

export async function putGalleryObject(key: string, body: Buffer, contentType: string): Promise<string> {
  const cfg = galleryStorageConfig();
  if (!cfg) {
    throw new AppError(
      "STORAGE_NOT_CONFIGURED",
      "Penyimpanan gambar belum dikonfigurasi. Isi GALLERY_S3_BUCKET, AWS_ENDPOINT_URL_S3, AWS_ACCESS_KEY_ID, dan AWS_SECRET_ACCESS_KEY di Vercel.",
      {},
      503,
    );
  }
  const { url, headers } = s3PutRequest(cfg, key, body, contentType, new Date());
  const res = await fetch(url, { method: "PUT", headers, body: new Uint8Array(body) });
  if (!res.ok) {
    throw new AppError("STORAGE_NOT_CONFIGURED", "Unggah gambar ke object storage gagal. Periksa bucket dan kredensial.", {}, 503);
  }
  return publicObjectUrl(cfg, key);
}
