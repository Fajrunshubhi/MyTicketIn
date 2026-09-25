import { describe, expect, it } from "vitest";
import { galleryStorageConfig, publicObjectUrl, s3PutRequest } from "@/lib/server/s3-put";

describe("gallery object storage", () => {
  it("is unconfigured without bucket credentials", () => {
    const prev = {
      GALLERY_S3_BUCKET: process.env.GALLERY_S3_BUCKET,
      AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
      AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
      AWS_ENDPOINT_URL_S3: process.env.AWS_ENDPOINT_URL_S3,
    };
    delete process.env.GALLERY_S3_BUCKET;
    delete process.env.AWS_ACCESS_KEY_ID;
    delete process.env.AWS_SECRET_ACCESS_KEY;
    delete process.env.AWS_ENDPOINT_URL_S3;
    try {
      expect(galleryStorageConfig()).toBeNull();
    } finally {
      for (const [key, value] of Object.entries(prev)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  it("builds a public URL and a signed PUT", () => {
    const cfg = {
      bucket: "gallery",
      accessKeyId: "AKIAEXAMPLE",
      secretAccessKey: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY",
      endpoint: "https://abc.r2.cloudflarestorage.com",
      region: "auto",
      publicBase: "https://img.example.com",
    };
    expect(publicObjectUrl(cfg, "gallery/a.jpg")).toBe("https://img.example.com/gallery/a.jpg");
    const req = s3PutRequest(cfg, "gallery/a.jpg", Buffer.from("hi"), "image/jpeg", new Date("2026-01-02T03:04:05Z"));
    expect(req.url).toBe("https://abc.r2.cloudflarestorage.com/gallery/gallery/a.jpg");
    expect(req.headers["X-Amz-Date"]).toBe("20260102T030405Z");
    expect(req.headers.Authorization).toMatch(/^AWS4-HMAC-SHA256 Credential=AKIAEXAMPLE\/20260102\/auto\/s3\/aws4_request/);
    expect(req.headers.Authorization).toMatch(/Signature=[0-9a-f]{64}$/);
  });
});
