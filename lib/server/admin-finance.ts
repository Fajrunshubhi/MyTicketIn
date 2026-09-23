import { AppError, execute, newId, query } from "@/lib/server/http";

export async function requestRefund(adminId: string, orderId: string, amount: number, reason: string) {
  const why = reason.trim();
  if (why.length < 10) throw new AppError("VALIDATION_ERROR", "Alasan wajib minimal 10 karakter.", {}, 400);
  if (!Number.isInteger(amount) || amount <= 0) throw new AppError("VALIDATION_ERROR", "Nominal tidak valid.", {}, 400);
  const pays = await query<{ id: string; amount_rupiah: string; status: string }>(
    `SELECT p.id, p.amount_rupiah::text, p.status::text AS status
     FROM payments p JOIN orders o ON o.id=p.order_id
     WHERE o.id=$1 AND o.status='PAID' AND p.status='SUCCEEDED'
     ORDER BY p.created_at DESC LIMIT 1`,
    [orderId],
  );
  const p = pays[0];
  if (!p) throw new AppError("NOT_FOUND", "Pembayaran sukses untuk order ini tidak ditemukan.", {}, 404);
  if (amount > Number(p.amount_rupiah)) throw new AppError("VALIDATION_ERROR", "Nominal refund melebihi pembayaran.", {}, 400);
  const id = newId();
  const refundNumber = `RFND-${id.replace(/-/g, "").slice(0, 12).toUpperCase()}`;
  await execute(
    `INSERT INTO refunds (id, refund_number, order_id, payment_id, amount_rupiah, reason, status, requested_by_user_id, requested_at, created_at, updated_at, version)
     VALUES ($1,$2,$3,$4,$5,$6,'REQUESTED'::refund_status,$7,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,1)`,
    [id, refundNumber, orderId, p.id, amount, why, adminId],
  );
  return { id, refundNumber, status: "REQUESTED", amountRupiah: amount, sandbox: true, cashValue: false };
}

export async function decideRefund(adminId: string, refundId: string, decision: string, reason: string) {
  const why = reason.trim();
  if (why.length < 10) throw new AppError("VALIDATION_ERROR", "Alasan wajib minimal 10 karakter.", {}, 400);
  const d = decision.trim().toUpperCase();
  const status = d === "APPROVE" || d === "APPROVED" ? "APPROVED" : d === "REJECT" || d === "REJECTED" ? "REJECTED" : "";
  if (!status) throw new AppError("VALIDATION_ERROR", "Keputusan tidak valid.", {}, 400);
  const n = await execute(
    `UPDATE refunds SET status=$1::refund_status, decided_by_user_id=$2, decided_at=CURRENT_TIMESTAMP, decision_reason=$3,
            updated_at=CURRENT_TIMESTAMP, version=version+1
     WHERE id=$4 AND status='REQUESTED'`,
    [status, adminId, why, refundId],
  );
  if (!n) throw new AppError("EVENT_STATUS_INVALID", "Refund tidak dapat diputuskan.", {}, 409);
  const rows = await query<{ id: string; refund_number: string; status: string; amount_rupiah: string }>(
    `SELECT id, refund_number, status::text AS status, amount_rupiah::text FROM refunds WHERE id=$1`,
    [refundId],
  );
  const r = rows[0];
  if (!r) throw new AppError("NOT_FOUND", "Refund tidak ditemukan.", {}, 404);
  return { id: r.id, refundNumber: r.refund_number, status: r.status, amountRupiah: Number(r.amount_rupiah), sandbox: true };
}

export async function listReconciliations(status: string) {
  const st = status.trim().toUpperCase() || "OPEN";
  const rows = await query<{
    id: string;
    order_number: string;
    payment_id: string;
    reason_code: string;
    created_at: string;
    status: string;
  }>(
    `SELECT r.id, o.order_number, r.payment_id, r.reason_code, r.created_at::text, r.status::text AS status
     FROM payment_reconciliations r
     JOIN orders o ON o.id=r.order_id
     WHERE ($1='' OR r.status::text=$1)
     ORDER BY r.created_at DESC, r.id DESC
     LIMIT 50`,
    [st],
  );
  return rows.map((r) => ({
    id: r.id,
    orderNumber: r.order_number,
    paymentId: r.payment_id,
    reasonCode: r.reason_code,
    createdAt: new Date(r.created_at).toISOString(),
    status: r.status,
  }));
}

export async function resolveReconciliation(adminId: string, id: string, decision: string, notes: string) {
  const why = notes.trim();
  if (why.length < 10) throw new AppError("VALIDATION_ERROR", "Catatan wajib minimal 10 karakter.", {}, 400);
  const d = decision.trim().toUpperCase();
  const status = d === "REJECT" ? "RESOLVED_REJECTED" : d === "ACCEPT_REFUND_SANDBOX" ? "RESOLVED_ACCEPTED" : "";
  if (!status) throw new AppError("VALIDATION_ERROR", "Keputusan tidak valid.", {}, 400);
  const n = await execute(
    `UPDATE payment_reconciliations SET status=$1::reconciliation_status, notes=$2, resolved_by_user_id=$3, resolved_at=CURRENT_TIMESTAMP,
            updated_at=CURRENT_TIMESTAMP, version=version+1
     WHERE id=$4 AND status='OPEN'`,
    [status, why, adminId, id],
  );
  if (!n) throw new AppError("EVENT_STATUS_INVALID", "Rekonsiliasi sudah diselesaikan.", {}, 409);
  const rows = await query<Record<string, unknown>>(`SELECT id, status::text AS status FROM payment_reconciliations WHERE id=$1`, [id]);
  return rows[0];
}
