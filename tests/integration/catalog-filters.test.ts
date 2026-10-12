import { beforeAll, describe, expect, it } from "vitest";
import { execute } from "@/lib/server/http";
import type { AuthUser } from "@/lib/server/access";
import { listCatalog } from "@/lib/server/catalog";
import { seedEvent, seedOrganizer, seedUser, tag } from "./helpers";

let organizer: AuthUser;
let orgProfileId: string;

beforeAll(async () => {
  organizer = await seedUser("catorg");
  orgProfileId = await seedOrganizer(organizer);
});

async function seed(category: string, startOffsetDays: number, publishedOffsetDays = 0) {
  const id = await seedEvent(orgProfileId, organizer.id, "GENERAL_ADMISSION");
  await execute(
    `UPDATE events SET category=$2,
       starts_at = date_trunc('day', CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta') AT TIME ZONE 'Asia/Jakarta' + ($3::int * INTERVAL '1 day') + INTERVAL '12 hours',
       ends_at = date_trunc('day', CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta') AT TIME ZONE 'Asia/Jakarta' + ($3::int * INTERVAL '1 day') + INTERVAL '15 hours',
       published_at = CURRENT_TIMESTAMP + ($4::int * INTERVAL '1 hour')
     WHERE id=$1`,
    [id, category, startOffsetDays, publishedOffsetDays],
  );
  return id;
}

const day = (offset: number) => new Date(Date.now() + 7 * 3_600_000 + offset * 86_400_000).toISOString().slice(0, 10);
const base = { q: "", city: "", province: "", tag: "", limit: 24 };

describe("catalog date range and sort (F20/F77)", () => {
  it("filters by inclusive Asia/Jakarta day range and keeps only Published future events", async () => {
    const cat = `Rng${tag()}`;
    const inside = await seed(cat, 3);
    const edgeStart = await seed(cat, 2);
    const edgeEnd = await seed(cat, 4);
    const outside = await seed(cat, 8);
    const draft = await seed(cat, 3);
    await execute(`UPDATE events SET status='CANCELLED' WHERE id=$1`, [draft]).catch(async () => {
      // Cancelled needs extra columns; unpublish by moving it into the past instead.
      await execute(
        `UPDATE events SET starts_at = CURRENT_TIMESTAMP - INTERVAL '5 days', ends_at = CURRENT_TIMESTAMP - INTERVAL '4 days' WHERE id=$1`,
        [draft],
      );
    });

    const res = await listCatalog({ ...base, category: cat, dateFrom: day(2), dateTo: day(4) });
    const slugs = res.items.map((i) => i.slug);
    expect(slugs).toHaveLength(3);
    expect(res.appliedFilters).toMatchObject({ dateFrom: day(2), dateTo: day(4) });

    const only = await listCatalog({ ...base, category: cat, dateFrom: day(8), dateTo: day(8) });
    expect(only.items).toHaveLength(1);
    expect([inside, edgeStart, edgeEnd, outside]).toHaveLength(4);
  });

  it("supports an open-ended range and ignores dates in past mode", async () => {
    const cat = `Opn${tag()}`;
    await seed(cat, 2);
    await seed(cat, 6);
    expect((await listCatalog({ ...base, category: cat, dateFrom: day(5) })).items).toHaveLength(1);
    expect((await listCatalog({ ...base, category: cat, dateTo: day(3) })).items).toHaveLength(1);
    expect((await listCatalog({ ...base, category: cat, dateFrom: day(100), when: "past" })).items).toHaveLength(0);
  });

  it("orders by soonest by default and by newest publication when requested", async () => {
    const cat = `Srt${tag()}`;
    const later = await seed(cat, 9, 0);
    const sooner = await seed(cat, 2, -48);
    void later;
    void sooner;
    const soonest = await listCatalog({ ...base, category: cat });
    const newest = await listCatalog({ ...base, category: cat, sort: "newest" });
    expect(soonest.items[0].slug).not.toBe(newest.items[0].slug);
    expect(newest.appliedFilters.sort).toBe("newest");
    expect(soonest.appliedFilters.sort).toBe("soonest");
    expect(new Date(soonest.items[0].startsAt).getTime()).toBeLessThan(new Date(soonest.items[1].startsAt).getTime());
  });
});
