import { describe, expect, it } from "vitest";
import { formatEventRating } from "@/lib/reviews-format";
import { normalizeReviewInput } from "@/lib/server/reviews";

describe("normalizeReviewInput", () => {
  it("accepts a 1–5 rating and a comment of 10–500 characters", () => {
    expect(normalizeReviewInput({ rating: 5, comment: "Acara rapi dan petugas ramah." })).toEqual({
      rating: 5,
      comment: "Acara rapi dan petugas ramah.",
    });
  });

  it("rejects invalid rating or short comment", () => {
    expect(() => normalizeReviewInput({ rating: 6, comment: "Acara rapi dan petugas ramah." })).toThrow();
    expect(() => normalizeReviewInput({ rating: 4, comment: "pendek" })).toThrow();
  });
});

describe("formatEventRating", () => {
  it("shows average to one decimal and review count", () => {
    expect(formatEventRating({ average: 4.6, count: 12 })).toBe("4,6 dari 5 · 12 ulasan");
    expect(formatEventRating({ average: 0, count: 0 })).toBe("Belum ada rating");
  });
});
