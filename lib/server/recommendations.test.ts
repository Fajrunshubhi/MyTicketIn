import { describe, expect, it } from "vitest";
import { diversifyByOrganizer, rankRecommendations, recommendationReason, recommendationScore, type RecommendationSignals } from "./reporting";

const none: RecommendationSignals = { category: 0, city: 0, province: 0, organizer: 0 };

describe("recommendation ranking (RFC-012)", () => {
  it("scores zero without signals", () => {
    expect(recommendationScore(none)).toBe(0);
  });

  it("uses weights category 3, city 2, province 1, organizer 1", () => {
    expect(recommendationScore({ category: 1, city: 1, province: 1, organizer: 1 })).toBe(7);
    expect(recommendationScore({ category: 5, city: 0, province: 0, organizer: 0 })).toBe(15);
    expect(recommendationScore({ category: 0, city: 2, province: 3, organizer: 4 })).toBe(11);
  });

  it("breaks ties by start time then id", () => {
    const rows = [
      { id: "b", score: 3, startsAt: "2030-01-02T00:00:00Z" },
      { id: "c", score: 3, startsAt: "2030-01-01T00:00:00Z" },
      { id: "a", score: 3, startsAt: "2030-01-01T00:00:00Z" },
      { id: "z", score: 5, startsAt: "2030-02-01T00:00:00Z" },
    ];
    expect(rankRecommendations(rows).map((r) => r.id)).toEqual(["z", "a", "c", "b"]);
  });

  it("caps events per organizer but backfills when candidates are few", () => {
    const ranked = ["a", "a", "a", "b", "c"].map((o, i) => ({ organizerKey: o, id: String(i) }));
    expect(diversifyByOrganizer(ranked, 4).map((r) => r.id)).toEqual(["0", "1", "3", "4"]);
    expect(diversifyByOrganizer(ranked.slice(0, 3), 3).map((r) => r.id)).toEqual(["0", "1", "2"]);
  });

  it("gives one reason from the largest contribution with a stable tie order", () => {
    expect(recommendationReason({ ...none, category: 1, organizer: 1 })).toBe("Kategori serupa");
    expect(recommendationReason({ ...none, organizer: 2, province: 1 })).toBe("Penyelenggara sama");
    expect(recommendationReason({ ...none, city: 1, province: 1 })).toBe("Lokasi serupa");
    // Seri 3 vs 3: kategori menang atas kota/provinsi/organizer.
    expect(recommendationReason({ category: 1, city: 0, province: 3, organizer: 0 })).toBe("Kategori serupa");
    expect(recommendationReason(none)).toBe("Mungkin Anda suka");
  });
});
