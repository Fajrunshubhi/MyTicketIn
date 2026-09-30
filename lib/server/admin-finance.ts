import { AppError, execute, query } from "@/lib/server/http";

export { completeSandboxRefund, confirmAdminTransfer, decideRefund, listAdminRefunds, listRefunds, requestRefund } from "@/lib/server/refunds";

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
