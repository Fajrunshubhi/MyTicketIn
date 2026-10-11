import { beforeAll, describe, expect, it } from "vitest";
import { execute, query } from "@/lib/server/http";
import type { AuthUser } from "@/lib/server/access";
import { createOrder } from "@/lib/server/orders";
import { createPayment, settlePaidOrder } from "@/lib/server/payments";
import { recommendations } from "@/lib/server/reporting";
import { idem, seedEvent, seedOrganizer, seedTicketType, seedUser, tag } from "./helpers";

let organizer: AuthUser;
let orgProfileId: string;

async function slugOf(eventId: string) {
  return (await query<{ slug: string }>(`SELECT slug FROM events WHERE id=$1`, [eventId]))[0].slug;
}

async function retag(eventId: string, category: string, city: string) {
  await execute(`UPDATE events SET category=$2, city=$3 WHERE id=$1`, [eventId, category, city]);
}

beforeAll(async () => {
  organizer = await seedUser("recorg");
  orgProfileId = await seedOrganizer(organizer);
});

describe("recommendations (F74)", () => {
  it("uses only the buyer's own PAID history and only future Published events", async () => {
    const cat = `Cat${tag()}`;
    const city = `City${tag()}`;
    const bought = await seedEvent(orgProfileId, organizer.id, "GENERAL_ADMISSION");
    await retag(bought, cat, city);
    const candidate = await seedEvent(orgProfileId, organizer.id, "GENERAL_ADMISSION");
    await retag(candidate, cat, `Other${tag()}`);
    const cancelled = await seedEvent(orgProfileId, organizer.id, "GENERAL_ADMISSION");
    await retag(cancelled, cat, `Other${tag()}`);
    // Event yang sudah lewat tidak boleh muncul.
    await execute(
      `UPDATE events SET starts_at = CURRENT_TIMESTAMP - INTERVAL '3 days', ends_at = CURRENT_TIMESTAMP - INTERVAL '2 days' WHERE id=$1`,
      [cancelled],
    );
    // Organizer berbeda agar tidak ada sinyal kontekstual ke kandidat.
    const otherOrg = await seedUser("recorg2");
    const otherProfile = await seedOrganizer(otherOrg);
    const current = await seedEvent(otherProfile, otherOrg.id, "GENERAL_ADMISSION");
    await retag(current, `Unrelated${tag()}`, `Nowhere${tag()}`);

    const buyer = await seedUser("recbuyer");
    const other = await seedUser("recother");
    const tt = await seedTicketType(bought, 5, 50000);
    const { view } = await createOrder(buyer, { eventId: bought, items: [{ ticketTypeId: tt, quantity: 1 }], confirmed: true }, idem());
    const orderId = String(view.id);
    // Order PENDING belum dihitung sebagai riwayat.
    const pending = await recommendations(await slugOf(current), 12, buyer.id);
    expect(pending.mode).toBe("CONTEXTUAL");

    const { payment } = await createPayment(buyer, orderId, "QRIS");
    expect(await settlePaidOrder(orderId, String(payment.id))).toBe(true);

    const slugCandidate = await slugOf(candidate);
    const mine = await recommendations(await slugOf(current), 12, buyer.id);
    const mineSlugs = (mine.items as { slug: string }[]).map((i) => i.slug);
    expect(mine.mode).toBe("HISTORY");
    expect(mineSlugs).toContain(slugCandidate);
    expect(mineSlugs).not.toContain(await slugOf(bought)); // sudah dibeli
    expect(mineSlugs).not.toContain(await slugOf(cancelled)); // bukan Published
    expect(mineSlugs).not.toContain(await slugOf(current));

    // Riwayat pengguna lain atau tanpa sesi tidak membocorkan sinyal personal.
    for (const uid of [other.id, null]) {
      const res = await recommendations(await slugOf(current), 12, uid);
      expect(res.mode).toBe("CONTEXTUAL");
      expect((res.items as { slug: string }[]).map((i) => i.slug)).not.toContain(slugCandidate);
    }
  });
});
