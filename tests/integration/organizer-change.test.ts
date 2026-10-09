import { describe, expect, it } from "vitest";
import { query } from "@/lib/server/http";
import { getById, type ApplicationBody } from "@/lib/server/organizers";
import { documentFlags, readDocument } from "@/lib/server/organizer-documents";
import {
  adminChangeView,
  cancelChange,
  decideChange,
  getPendingChange,
  readChangeDocumentAsAdmin,
  submitChange,
} from "@/lib/server/organizer-changes";
import { seedOrganizer, seedUser, tag } from "./helpers";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

const body = (version: number): ApplicationBody & { expectedVersion: number } => ({
  name: `Organizer Baru ${tag()}`,
  contactEmail: "baru@example.test",
  contactPhone: "081234567890",
  description: "Penyelenggara konser komunitas yang memperbarui data verifikasinya.",
  organizerType: "INDIVIDUAL",
  picName: "Budi Santoso",
  city: "Bandung",
  referenceUrl: "https://instagram.com/komunitas",
  bankName: "BCA",
  bankAccountName: "Budi Santoso",
  bankAccountNumber: "1234567890",
  consent: true,
  expectedVersion: version,
});

async function approvedOrganizer(label: string) {
  const owner = await seedUser(label);
  const id = await seedOrganizer(owner);
  const p = await getById(id);
  return { owner, id, version: Number(p!.version) };
}

describe("organizer data change needs admin approval", () => {
  it("keeps the live profile untouched while pending and rejects a second open request", async () => {
    const { owner, id, version } = await approvedOrganizer("chg1");
    const before = await getById(id);
    const row = await submitChange(owner, body(version), { ktp: PNG, selfie: PNG });
    expect(row.status).toBe("PENDING");

    const live = await getById(id);
    expect(live!.name).toBe(before!.name);
    expect(live!.bank_account_number).toBeNull();
    expect(await documentFlags(id)).toEqual({ hasKtp: false, hasSelfie: false });

    await expect(submitChange(owner, body(version), { ktp: PNG, selfie: PNG })).rejects.toMatchObject({
      code: "ORGANIZER_CHANGE_PENDING",
    });
  });

  it("requires KTP and selfie while the live profile has none, and validates the bank account", async () => {
    const { owner, version } = await approvedOrganizer("chg2");
    await expect(submitChange(owner, body(version), {})).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(
      submitChange(owner, { ...body(version), bankAccountNumber: "12" }, { ktp: PNG, selfie: PNG }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(
      submitChange(owner, body(version), { ktp: PNG, selfie: Buffer.from("not an image") }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("applies data and re-sealed documents only after an admin approves, once", async () => {
    const { owner, id, version } = await approvedOrganizer("chg3");
    const admin = await seedUser("chgadm", "ADMIN");
    const input = body(version);
    const row = await submitChange(owner, input, { ktp: PNG, selfie: PNG });

    const view = await adminChangeView(id);
    expect(view).toMatchObject({ newKtp: true, newSelfie: true, bankAccountNumber: "1234567890" });
    await readChangeDocumentAsAdmin(admin.id, row.id, "KTP", `corr-${tag()}`);
    const logs = await query(`SELECT id FROM audit_logs WHERE action='organizer.change_document.view' AND entity_id=$1`, [row.id]);
    expect(logs).toHaveLength(1);

    await expect(decideChange(admin, row.id, "APPROVE", "pendek")).rejects.toMatchObject({ code: "ORGANIZER_REASON_REQUIRED" });
    await decideChange(admin, row.id, "APPROVE", "Data dan KTP sesuai.");

    const live = await getById(id);
    expect(live!.name).toBe(input.name);
    expect(live!.bank_account_number).toBe("1234567890");
    expect(Number(live!.version)).toBeGreaterThan(version);
    expect((await readDocument(id, "KTP")).bytes.equals(PNG)).toBe(true);
    expect(await getPendingChange(id)).toBeNull();
    const left = await query(`SELECT id FROM organizer_change_request_documents WHERE change_request_id=$1`, [row.id]);
    expect(left).toHaveLength(0);

    await expect(decideChange(admin, row.id, "APPROVE", "Data dan KTP sesuai.")).rejects.toMatchObject({
      code: "ORGANIZER_CHANGE_CONFLICT",
    });
  });

  it("leaves the live profile unchanged on rejection, and the owner may cancel an open request", async () => {
    const { owner, id, version } = await approvedOrganizer("chg4");
    const admin = await seedUser("chgadm2", "ADMIN");
    const before = await getById(id);
    const row = await submitChange(owner, body(version), { ktp: PNG, selfie: PNG });
    await decideChange(admin, row.id, "REJECT", "Foto KTP tidak terbaca jelas.");
    const after = await getById(id);
    expect(after!.name).toBe(before!.name);
    expect(after!.bank_account_number).toBeNull();
    expect(await documentFlags(id)).toEqual({ hasKtp: false, hasSelfie: false });

    const again = await submitChange(owner, body(Number(after!.version)), { ktp: PNG, selfie: PNG });
    await cancelChange(owner);
    expect((await getPendingChange(id))).toBeNull();
    const rows = await query<{ status: string }>(`SELECT status FROM organizer_change_requests WHERE id=$1`, [again.id]);
    expect(rows[0].status).toBe("CANCELLED");
  });

  it("refuses a change from an organizer that is not approved", async () => {
    const owner = await seedUser("chg5");
    await expect(submitChange(owner, body(1), { ktp: PNG, selfie: PNG })).rejects.toMatchObject({
      code: "ORGANIZER_APPLICATION_NOT_FOUND",
    });
  });
});
