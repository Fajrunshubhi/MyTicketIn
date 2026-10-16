import { describe, expect, it } from "vitest";
import { HERO_SLIDE_LIMIT, pickHeroSlides } from "./hero-slides";

function ev(id: string, day: string, paidCount: number) {
  return { id, startsAt: `2026-11-${day}T00:00:00.000Z`, paidCount };
}

describe("pickHeroSlides", () => {
  it("caps at six and uses the soonest when nobody has bought", () => {
    const pool = [ev("a", "10", 0), ev("b", "02", 0), ev("c", "08", 0), ev("d", "01", 0), ev("e", "03", 0), ev("f", "04", 0), ev("g", "05", 0)];
    const picked = pickHeroSlides(pool);
    expect(picked).toHaveLength(HERO_SLIDE_LIMIT);
    expect(picked.map((item) => item.id)).toEqual(["d", "b", "e", "f", "g", "c"]);
  });

  it("keeps the most purchased even if they are later, then fills with the soonest", () => {
    const pool = [
      ev("soon1", "01", 0),
      ev("soon2", "02", 0),
      ev("soon3", "03", 1),
      ev("hot", "20", 40),
      ev("hot2", "21", 12),
      ev("later", "15", 0),
    ];
    expect(pickHeroSlides(pool).map((item) => item.id)).toEqual(["hot", "hot2", "soon3", "soon1", "soon2", "later"]);
  });

  it("does not duplicate an event that is both soon and popular", () => {
    const pool = [ev("a", "01", 9), ev("b", "02", 8), ev("c", "03", 7), ev("d", "04", 0), ev("e", "05", 0), ev("f", "06", 0)];
    const picked = pickHeroSlides(pool);
    expect(picked.map((item) => item.id)).toEqual(["a", "b", "c", "d", "e", "f"]);
    expect(new Set(picked.map((item) => item.id)).size).toBe(6);
  });
});
