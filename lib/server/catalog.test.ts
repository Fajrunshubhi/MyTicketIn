import { describe, expect, it } from "vitest";
import { dummyCover } from "@/lib/server/catalog";
import { authorizePortal, parseRegisterIntent, parsePortal } from "@/lib/server/access";
import { authoringMutable, detailsEditable, normalizeEventInput, normalizeTicketInput } from "@/lib/server/events-organizer";
import { publicImageSrc } from "@/lib/server/gallery";

describe("dummyCover", () => {
  it("maps category keywords to static dummy images", () => {
    expect(dummyCover("Seni", "Pameran")).toBe("/dummy-events/theater-1.jpg");
    expect(dummyCover("Olahraga", "Lari Kota")).toBe("/dummy-events/run-jakarta.jpg");
    expect(dummyCover("Kuliner", "Food Fest")).toBe("/dummy-events/food-1.jpg");
    expect(dummyCover("Seminar", "Summit")).toBe("/dummy-events/summit-1.jpg");
    expect(dummyCover("Musik", "Jazz Night")).toBe("/dummy-events/jazz-1.jpg");
  });
});

describe("portal", () => {
  it("rejects admin register intent", () => {
    expect(() => parseRegisterIntent("admin")).toThrow();
    expect(parseRegisterIntent("organizer")).toBe("buyer");
    expect(parsePortal("")).toBe("buyer");
  });

  it("blocks organizer portal for buyers", () => {
    const msg = authorizePortal("organizer", {
      kind: "buyer",
      isAdmin: false,
      canBuy: true,
      canOrganize: false,
      canApplyOrganizer: true,
      organizerStatus: null,
    });
    expect(msg).toMatch(/pembeli/i);
  });

  it("accepts staff portal and rejects register intent", () => {
    expect(parsePortal("staff")).toBe("staff");
    expect(() => parseRegisterIntent("staff")).toThrow();
    const denied = authorizePortal("staff", {
      kind: "buyer",
      isAdmin: false,
      canBuy: true,
      canOrganize: false,
      canApplyOrganizer: true,
      organizerStatus: null,
    });
    expect(denied).toMatch(/petugas tidak terdaftar/i);
  });
});

describe("event authoring status", () => {
  it("allows published event copy edits but not pending review", () => {
    expect(detailsEditable("PUBLISHED")).toBe(true);
    expect(detailsEditable("DRAFT")).toBe(true);
    expect(detailsEditable("REJECTED")).toBe(true);
    expect(detailsEditable("NEEDS_CHANGES")).toBe(true);
    expect(detailsEditable("PENDING_REVIEW")).toBe(false);
    expect(detailsEditable("CANCELLED")).toBe(false);
    expect(detailsEditable("COMPLETED")).toBe(false);
  });

  it("locks inventory-mode mutation to draft authoring", () => {
    expect(authoringMutable("DRAFT")).toBe(true);
    expect(authoringMutable("PUBLISHED")).toBe(false);
  });
});

describe("normalizeEventInput", () => {
  const base = {
    title: "Konser Kota",
    description: "Deskripsi event yang cukup panjang untuk lolos validasi.",
    category: "Musik",
    venueName: "GBK",
    addressLine: "Jl. Pintu Satu",
    city: "Jakarta",
    province: "DKI Jakarta",
    latitude: -6.2,
    longitude: 106.8,
    tags: ["Jakarta Events", "musik"],
    timezone: "Asia/Jakarta",
    startsAt: "2026-11-01T10:00:00.000Z",
    endsAt: "2026-11-01T12:00:00.000Z",
    terms: "Tidak refund.",
    contactEmail: "Joko@Gmail.com",
    contactPhone: "081226765071",
    inventoryMode: "ZONED",
  };

  it("lowercases contact email and normalizes tags", () => {
    const got = normalizeEventInput(base);
    expect(got.contactEmail).toBe("joko@gmail.com");
    expect(got.tags).toEqual(["jakarta-events", "musik"]);
    expect(got.inventoryMode).toBe("ZONED");
  });

  it("rejects short description instead of hitting the database check", () => {
    expect(() => normalizeEventInput({ ...base, description: "terlalu pendek" })).toThrow(/formulir/i);
  });
});

describe("normalizeTicketInput", () => {
  it("rejects sale end before sale start", () => {
    expect(() =>
      normalizeTicketInput(
        {
          name: "Reguler",
          priceRupiah: 100000,
          quota: 50,
          saleStartsAt: "2026-09-30T16:51:00.000Z",
          saleEndsAt: "2026-09-30T06:51:00.000Z",
        },
        "2026-10-01T00:00:00.000Z",
      ),
    ).toThrow(/formulir/i);
  });

  it("accepts a window that ends before the event starts", () => {
    const got = normalizeTicketInput(
      {
        name: "Reguler",
        priceRupiah: 100000,
        quota: 50,
        saleStartsAt: "2026-09-01T00:00:00.000Z",
        saleEndsAt: "2026-09-30T16:00:00.000Z",
      },
      "2026-10-01T00:00:00.000Z",
    );
    expect(got.maxPerAccount).toBe(50);
  });
});

describe("event mutation policy", () => {
  it("rejects short cancellation reasons before touching the database", async () => {
    const { markEventCancelled } = await import("@/lib/server/events-organizer");
    await expect(markEventCancelled("evt", "admin", "pendek")).rejects.toThrow(/10/);
  });
});

describe("publicImageSrc", () => {
  it("falls back when a local gallery file is missing", () => {
    expect(publicImageSrc("/uploads/gallery/missingfile.jpg", "/dummy-events/jazz-1.jpg")).toBe("/dummy-events/jazz-1.jpg");
    expect(publicImageSrc("/dummy-events/theater-1.jpg", "/x")).toBe("/dummy-events/theater-1.jpg");
  });

  it("does not serve local uploads on Vercel", () => {
    const prev = process.env.VERCEL;
    process.env.VERCEL = "1";
    try {
      expect(publicImageSrc("/uploads/gallery/abc123.jpg", "/dummy-events/jazz-1.jpg")).toBe("/dummy-events/jazz-1.jpg");
    } finally {
      if (prev === undefined) delete process.env.VERCEL;
      else process.env.VERCEL = prev;
    }
  });
});
