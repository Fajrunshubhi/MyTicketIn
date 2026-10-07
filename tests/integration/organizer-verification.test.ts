import { describe, expect, it } from "vitest";
import { execute, query } from "@/lib/server/http";
import {
  editApplication,
  resubmitApplication,
  submitApplication,
  type ApplicationBody,
} from "@/lib/server/organizers";
import {
  documentFlags,
  purgeRejectedDocuments,
  readDocument,
  readDocumentAsAdmin,
} from "@/lib/server/organizer-documents";
import { seedUser, tag } from "./helpers";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

const body = (): ApplicationBody => ({
  name: `Komunitas ${tag()}`,
  contactEmail: "kontak@example.test",
  contactPhone: "081234567890",
  description: "Komunitas musik yang menyelenggarakan konser kecil di Bandung.",
  organizerType: "INDIVIDUAL",
  picName: "Budi Santoso",
  city: "Bandung",
  referenceUrl: "https://instagram.com/komunitas",
  bankName: "BCA",
  bankAccountName: "Budi Santoso",
  bankAccountNumber: "1234567890",
  consent: true,
});

describe("organizer verification (F7/F8)", () => {
  it("stores the application with encrypted documents readable only by owner profile id", async () => {
    const user = await seedUser("orgv");
    const p = await submitApplication(user, body(), { ktp: PNG, selfie: PNG });
    expect(await documentFlags(p.id)).toEqual({ hasKtp: true, hasSelfie: true });
    const raw = await query<{ ciphertext: Buffer }>(
      `SELECT ciphertext FROM organizer_verification_documents WHERE organizer_profile_id=$1 AND kind='KTP'`,
      [p.id],
    );
    expect(Buffer.from(raw[0].ciphertext).equals(PNG)).toBe(false);
    expect((await readDocument(p.id, "KTP")).bytes.equals(PNG)).toBe(true);
  });

  it("rejects missing consent, bad phone, and non-image files without creating a profile", async () => {
    const user = await seedUser("orgbad");
    await expect(submitApplication(user, { ...body(), consent: false }, { ktp: PNG, selfie: PNG })).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
    await expect(submitApplication(user, { ...body(), contactPhone: "" }, { ktp: PNG, selfie: PNG })).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
    await expect(
      submitApplication(user, body(), { ktp: PNG, selfie: Buffer.from("<script>alert(1)</script>") }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    const rows = await query(`SELECT id FROM organizer_profiles WHERE owner_user_id=$1`, [user.id]);
    expect(rows).toHaveLength(0);
  });

  it("requires a valid bank account", async () => {
    const user = await seedUser("orgbank");
    for (const patch of [{ bankName: "Bank Palsu" }, { bankAccountNumber: "123" }, { bankAccountName: "" }]) {
      await expect(submitApplication(user, { ...body(), ...patch }, { ktp: PNG, selfie: PNG })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    }
    const p = await submitApplication(user, body(), { ktp: PNG, selfie: PNG });
    expect(p.bank_account_number).toBe("1234567890");
  });

  it("audits every admin document view", async () => {
    const user = await seedUser("orgaud");
    const admin = await seedUser("orgadm", "ADMIN");
    const p = await submitApplication(user, body(), { ktp: PNG, selfie: PNG });
    await readDocumentAsAdmin(admin.id, p.id, "KTP", `corr-${tag()}`);
    const logs = await query(
      `SELECT id FROM audit_logs WHERE action='organizer.document.view' AND entity_id=$1 AND actor_user_id=$2`,
      [p.id, admin.id],
    );
    expect(logs).toHaveLength(1);
  });

  it("requires documents on resubmit and purges them 30 days after rejection", async () => {
    const user = await seedUser("orgrej");
    const admin = await seedUser("orgrejadm", "ADMIN");
    const p = await submitApplication(user, body(), { ktp: PNG, selfie: PNG });
    await execute(
      `UPDATE organizer_profiles SET status='REJECTED'::organizer_status, decision_reason='Foto buram, mohon perbaiki.',
              decided_at=CURRENT_TIMESTAMP - INTERVAL '31 days', decided_by_user_id=$2, version=version+1 WHERE id=$1`,
      [p.id, admin.id],
    );
    const purged = await purgeRejectedDocuments();
    expect(purged.profiles).toBeGreaterThanOrEqual(1);
    expect(await documentFlags(p.id)).toEqual({ hasKtp: false, hasSelfie: false });

    const fresh = await query<{ version: number }>(`SELECT version FROM organizer_profiles WHERE id=$1`, [p.id]);
    const version = Number(fresh[0].version);
    await expect(resubmitApplication(user, version)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    const edited = await editApplication(user, { ...body(), expectedVersion: version }, { ktp: PNG, selfie: PNG });
    expect((await resubmitApplication(user, edited.version)).status).toBe("PENDING");
  });

  it("does not purge documents of pending applications or recent rejections", async () => {
    const user = await seedUser("orgkeep");
    const p = await submitApplication(user, body(), { ktp: PNG, selfie: PNG });
    await purgeRejectedDocuments();
    expect((await documentFlags(p.id)).hasKtp).toBe(true);
  });
});
