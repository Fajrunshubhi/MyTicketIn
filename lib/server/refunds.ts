import { AppError, execute, newId, query } from "@/lib/server/http";
import { eventOwnerUserId, notify } from "@/lib/server/notifications";
import { refundOversightFlag } from "@/lib/order-refund-display";
import { buyerCancelRefundAmount, earnReversalDelta, isFullRefund, isParsedRefundBank, parseRefundBank, remainingRefundable, TRANSFER_HOLD_HOURS, type RefundBankInput } from "@/lib/server/refund-policy";
import { readGalleryFile, saveGalleryFile } from "@/lib/server/gallery";

const OPEN_STATUSES = "('REQUESTED','APPROVED','PROCESSING','COMPLETED')";

type RefundRow = {
  id: string;
  refund_number: string;
  order_id: string;
  payment_id: string;
  amount_rupiah: string;
  reason: string;
  status: string;
  source: string;
  requested_at: string;
  decided_at: string | null;
  completed_at: string | null;
  bank_name: string | null;
  bank_account_name: string | null;
  bank_account_number: string | null;
  transfer_due_at: string | null;
  transferred_at: string | null;
  transfer_proof_name: string | null;
  decision_reason: string | null;
};

const REFUND_COLS = `rf.id, rf.refund_number, rf.order_id, rf.payment_id, rf.amount_rupiah::text, rf.reason, rf.status::text AS status,
            COALESCE(rf.source, 'ADMIN') AS source, rf.requested_at::text, rf.decided_at::text, rf.completed_at::text,
            rf.bank_name, rf.bank_account_name, rf.bank_account_number, rf.transfer_due_at::text, rf.transferred_at::text,
            rf.transfer_proof_name, rf.decision_reason`;

function refundDto(r: RefundRow) {
  return {
    id: r.id,
    refundNumber: r.refund_number,
    orderId: r.order_id,
    paymentId: r.payment_id,
    amountRupiah: Number(r.amount_rupiah),
    reason: r.reason,
    status: r.status,
    source: r.source || "ADMIN",
    requestedAt: r.requested_at,
    decidedAt: r.decided_at,
    completedAt: r.completed_at,
    decisionReason: r.decision_reason,
    bankName: r.bank_name,
    accountName: r.bank_account_name,
    accountNumber: r.bank_account_number,
    transferDueAt: r.transfer_due_at,
    transferredAt: r.transferred_at,
    hasTransferProof: Boolean(r.transfer_proof_name),
    sandbox: true,
    cashValue: false,
    holdHours: TRANSFER_HOLD_HOURS,
  };
}

async function outstandingRupiah(orderId: string): Promise<number> {
  const rows = await query<{ n: string }>(
    `SELECT COALESCE(SUM(amount_rupiah),0)::text AS n FROM refunds
     WHERE order_id=$1 AND status IN ${OPEN_STATUSES}`,
    [orderId],
  );
  return Number(rows[0]?.n || 0);
}

async function assertUnusedOnly(orderId: string): Promise<void> {
  const used = await query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM tickets WHERE order_id=$1 AND status='USED'::ticket_status`,
    [orderId],
  );
  if (Number(used[0]?.n || 0) > 0) {
    throw new AppError("REFUND_NOT_ALLOWED", "Tiket yang sudah check-in tidak dapat direfund.", {}, 409);
  }
}

async function paidPayment(orderId: string) {
  const pays = await query<{ id: string; amount_rupiah: string; status: string }>(
    `SELECT p.id, p.amount_rupiah::text, p.status::text AS status
     FROM payments p JOIN orders o ON o.id=p.order_id
     WHERE o.id=$1 AND o.status IN ('PAID'::order_status,'REFUNDED'::order_status) AND p.status IN ('SUCCEEDED'::payment_status,'REFUNDED'::payment_status)
     ORDER BY p.created_at DESC LIMIT 1`,
    [orderId],
  );
  const p = pays[0];
  if (!p) throw new AppError("NOT_FOUND", "Pembayaran sukses untuk order ini tidak ditemukan.", {}, 404);
  return p;
}

async function notifyRefund(orderId: string, refundId: string, refundNumber: string, status: string, extra: string) {
  const buyers = await query<{ buyer_user_id: string; event_id: string }>(
    `SELECT buyer_user_id, event_id FROM orders WHERE id=$1 LIMIT 1`,
    [orderId],
  );
  const buyer = buyers[0];
  if (!buyer) return;
  const titles: Record<string, string> = {
    REQUESTED: "Pengajuan refund diterima",
    APPROVED: "Refund disetujui, menunggu transfer",
    REJECTED: "Refund ditolak",
    PROCESSING: "Refund diproses (sandbox)",
    COMPLETED: "Refund selesai — bukti transfer tersedia",
    FAILED: "Refund gagal (sandbox)",
  };
  await notify({
    recipientUserId: buyer.buyer_user_id,
    type: "REFUND_UPDATED",
    title: titles[status] || "Status refund diperbarui",
    body: extra,
    actionPath: `/dashboard/refunds?refund=${refundId}`,
    entityType: "Refund",
    entityId: refundId,
    deduplicationKey: `refund:${refundId}:${status}`,
    domainEventId: `refund:${refundId}:${status}`,
  });
  const owner = await eventOwnerUserId(buyer.event_id);
  if (owner && (status === "REQUESTED" || status === "APPROVED" || status === "COMPLETED")) {
    await notify({
      recipientUserId: owner,
      type: "REFUND_UPDATED",
      title:
        status === "REQUESTED"
          ? "Pembeli mengajukan refund"
          : status === "APPROVED"
            ? "Transfer refund dalam 24 jam"
            : "Refund order selesai (sandbox)",
      body:
        status === "REQUESTED"
          ? `Refund ${refundNumber} menunggu keputusan. Cek rekening pembeli.`
          : status === "APPROVED"
            ? `Refund ${refundNumber} disetujui. Unggah bukti transfer dalam 1×24 jam.`
            : `Refund ${refundNumber} dicatat tanpa transfer uang nyata.`,
      actionPath: `/dashboard/refunds?refund=${refundId}`,
      entityType: "Refund",
      entityId: refundId,
      deduplicationKey: `refund-org:${refundId}:${status}:${owner}`,
      domainEventId: `refund:${refundId}:${status}`,
    });
  }
}

async function restorePaidInventory(ticketTypeId: string, qty: number): Promise<void> {
  if (qty <= 0) return;
  const n = await execute(
    `UPDATE event_ticket_types SET paid_quantity = paid_quantity - $2, updated_at=CURRENT_TIMESTAMP, version=version+1
     WHERE id=$1 AND paid_quantity >= $2`,
    [ticketTypeId, qty],
  );
  if (!n) throw new AppError("INVENTORY_UNAVAILABLE", "Kuota tidak dapat dipulihkan.", {}, 409);
}

async function cancelUnusedTickets(orderId: string | null, eventId: string | null, source: "REFUND_COMPLETED" | "EVENT_CANCELLED", ref: string) {
  const rows = await query<{ ticket_type_id: string }>(
    orderId
      ? `UPDATE tickets SET status='CANCELLED'::ticket_status, cancelled_at=CURRENT_TIMESTAMP,
                cancellation_source=$2::ticket_cancellation_source, cancellation_reference_id=$3,
                updated_at=CURRENT_TIMESTAMP, version=version+1
         WHERE order_id=$1 AND status='UNUSED'::ticket_status
         RETURNING ticket_type_id`
      : `UPDATE tickets SET status='CANCELLED'::ticket_status, cancelled_at=CURRENT_TIMESTAMP,
                cancellation_source=$2::ticket_cancellation_source, cancellation_reference_id=$3,
                updated_at=CURRENT_TIMESTAMP, version=version+1
         WHERE event_id=$1 AND status='UNUSED'::ticket_status
         RETURNING ticket_type_id`,
    [orderId || eventId, source, ref],
  );
  const counts = new Map<string, number>();
  for (const row of rows) {
    counts.set(row.ticket_type_id, (counts.get(row.ticket_type_id) || 0) + 1);
  }
  for (const [typeId, qty] of counts) {
    await restorePaidInventory(typeId, qty);
  }
}

async function applyLoyaltyOnCompleted(orderId: string, refundId: string, cumulative: number): Promise<boolean> {
  const orders = await query<{
    status: string;
    total_payable_rupiah: string;
    loyalty_earned_points: string;
    loyalty_reversed_points: string;
    loyalty_redeemed_restored: boolean;
    loyalty_account_id: string | null;
    redeemed_points: string;
    event_id: string;
    buyer_user_id: string;
  }>(
    `SELECT status::text AS status, total_payable_rupiah::text, loyalty_earned_points::text, loyalty_reversed_points::text,
            loyalty_redeemed_restored, loyalty_account_id, redeemed_points::text, event_id, buyer_user_id
     FROM orders WHERE id=$1 LIMIT 1`,
    [orderId],
  );
  const o = orders[0];
  if (!o || (o.status !== "PAID" && o.status !== "REFUNDED")) {
    throw new AppError("REFUND_NOT_ALLOWED", "Order tidak dapat direfund.", {}, 409);
  }
  const payable = Number(o.total_payable_rupiah);
  const earned = Number(o.loyalty_earned_points || 0);
  const reversed = Number(o.loyalty_reversed_points || 0);
  const reversal = earnReversalDelta({
    earnedPoints: earned,
    alreadyReversed: reversed,
    totalPayableRupiah: payable,
    cumulativeCompletedRupiah: cumulative,
  });
  const full = isFullRefund(cumulative, payable);
  let accountId = o.loyalty_account_id;
  if ((reversal > 0 || (full && Number(o.redeemed_points) > 0 && !o.loyalty_redeemed_restored)) && !accountId) {
    const ev = await query<{ organizer_profile_id: string }>(`SELECT organizer_profile_id FROM events WHERE id=$1`, [o.event_id]);
    const orgId = ev[0]?.organizer_profile_id;
    if (orgId) {
      const acc = await query<{ id: string }>(
        `INSERT INTO loyalty_accounts (id, buyer_user_id, organizer_profile_id, balance_points, debt_points, reserved_points)
         VALUES ($1,$2,$3,0,0,0)
         ON CONFLICT (buyer_user_id, organizer_profile_id) DO UPDATE SET updated_at=CURRENT_TIMESTAMP
         RETURNING id`,
        [newId(), o.buyer_user_id, orgId],
      );
      accountId = acc[0]?.id || null;
    }
  }
  if (accountId && reversal > 0) {
    const acc = await query<{ balance_points: string; debt_points: string }>(
      `UPDATE loyalty_accounts SET debt_points = debt_points + $2, updated_at=CURRENT_TIMESTAMP, version=version+1
       WHERE id=$1 RETURNING balance_points::text, debt_points::text`,
      [accountId, reversal],
    );
    await execute(
      `INSERT INTO loyalty_ledger_entries (
         id, account_id, entry_type, points_delta, source_key, order_id, refund_id,
         balance_points_after, debt_points_after, actor_type, correlation_id
       ) VALUES ($1,$2,'EARN_REVERSAL', $3, $4, $5, $6, $7, $8, 'SYSTEM', $9)
       ON CONFLICT (account_id, source_key, entry_type) DO NOTHING`,
      [
        newId(),
        accountId,
        -reversal,
        `refund:${refundId}`,
        orderId,
        refundId,
        Number(acc[0]?.balance_points || 0),
        Number(acc[0]?.debt_points || 0),
        newId(),
      ],
    );
  }
  if (full && accountId && Number(o.redeemed_points) > 0 && !o.loyalty_redeemed_restored) {
    const restore = Number(o.redeemed_points);
    const acc = await query<{ balance_points: string; debt_points: string }>(
      `UPDATE loyalty_accounts SET balance_points = balance_points + $2, updated_at=CURRENT_TIMESTAMP, version=version+1
       WHERE id=$1 RETURNING balance_points::text, debt_points::text`,
      [accountId, restore],
    );
    await execute(
      `INSERT INTO loyalty_ledger_entries (
         id, account_id, entry_type, points_delta, source_key, order_id, refund_id,
         balance_points_after, debt_points_after, actor_type, correlation_id
       ) VALUES ($1,$2,'REDEEM_RESTORE', $3, $4, $5, $6, $7, $8, 'SYSTEM', $9)
       ON CONFLICT (account_id, source_key, entry_type) DO NOTHING`,
      [
        newId(),
        accountId,
        restore,
        `order:${orderId}:full-refund`,
        orderId,
        refundId,
        Number(acc[0]?.balance_points || 0),
        Number(acc[0]?.debt_points || 0),
        newId(),
      ],
    );
  }
  const nextReversed = reversed + reversal;
  if (full) {
    await execute(
      `UPDATE orders SET status='REFUNDED'::order_status, loyalty_reversed_points=$2, loyalty_redeemed_restored=$3,
              updated_at=CURRENT_TIMESTAMP, version=version+1
       WHERE id=$1 AND status IN ('PAID'::order_status,'REFUNDED'::order_status)`,
      [orderId, nextReversed, Number(o.redeemed_points) > 0],
    );
  } else {
    await execute(
      `UPDATE orders SET loyalty_reversed_points=$2, updated_at=CURRENT_TIMESTAMP, version=version+1 WHERE id=$1`,
      [orderId, nextReversed],
    );
  }
  return full;
}

export async function completeSandboxRefund(refundId: string): Promise<ReturnType<typeof refundDto>> {
  const current = await query<RefundRow>(
    `SELECT ${REFUND_COLS}
     FROM refunds rf WHERE rf.id=$1 LIMIT 1`,
    [refundId],
  );
  const rf = current[0];
  if (!rf) throw new AppError("NOT_FOUND", "Refund tidak ditemukan.", {}, 404);
  if (rf.status === "COMPLETED") return refundDto(rf);
  if (rf.status !== "APPROVED" && rf.status !== "PROCESSING") {
    throw new AppError("REFUND_NOT_ALLOWED", "Refund belum siap diselesaikan.", {}, 409);
  }
  await assertUnusedOnly(rf.order_id);
  await execute(
    `UPDATE refunds SET status='PROCESSING'::refund_status, external_reference=COALESCE(external_reference,$2),
            updated_at=CURRENT_TIMESTAMP, version=version+1
     WHERE id=$1 AND status IN ('APPROVED'::refund_status,'PROCESSING'::refund_status)`,
    [refundId, `sandbox-rfnd-${refundId.slice(0, 16)}`],
  );
  const marked = await execute(
    `UPDATE refunds SET status='COMPLETED'::refund_status, completed_at=CURRENT_TIMESTAMP, loyalty_processed_at=CURRENT_TIMESTAMP,
            updated_at=CURRENT_TIMESTAMP, version=version+1
     WHERE id=$1 AND status='PROCESSING'::refund_status AND loyalty_processed_at IS NULL`,
    [refundId],
  );
  if (!marked) {
    const again = await query<RefundRow>(
      `SELECT ${REFUND_COLS} FROM refunds rf WHERE rf.id=$1`,
      [refundId],
    );
    if (again[0]) return refundDto(again[0]);
    throw new AppError("NOT_FOUND", "Refund tidak ditemukan.", {}, 404);
  }
  const sums = await query<{ n: string }>(
    `SELECT COALESCE(SUM(amount_rupiah),0)::text AS n FROM refunds rf WHERE rf.order_id=$1 AND rf.status='COMPLETED'::refund_status`,
    [rf.order_id],
  );
  const cumulative = Number(sums[0]?.n || 0);
  const full = await applyLoyaltyOnCompleted(rf.order_id, refundId, cumulative);
  const cancelTickets = full || rf.source === "BUYER" || rf.source === "EVENT_CANCELLED";
  if (cancelTickets) {
    await cancelUnusedTickets(rf.order_id, null, "REFUND_COMPLETED", refundId);
  }
  if (full) {
    await execute(
      `UPDATE payments SET status='REFUNDED'::payment_status, refunded_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, version=version+1
       WHERE id=$1 AND status='SUCCEEDED'::payment_status`,
      [rf.payment_id],
    );
  }
  const moneyNote =
    rf.source === "BUYER"
      ? `Refund ${rf.refund_number} selesai: 75% nominal (pembatalan pembeli). 25% tidak dikembalikan. Sandbox, bukan transfer uang.`
      : `Refund ${rf.refund_number} selesai sebagai catatan uji. Tidak ada transfer uang nyata.`;
  await notifyRefund(rf.order_id, refundId, rf.refund_number, "COMPLETED", moneyNote);
  const out = await query<RefundRow>(
    `SELECT ${REFUND_COLS} FROM refunds rf WHERE rf.id=$1`,
    [refundId],
  );
  if (!out[0]) throw new AppError("NOT_FOUND", "Refund tidak ditemukan.", {}, 404);
  return refundDto(out[0]);
}

async function insertRefund(
  orderId: string,
  actorId: string,
  amount: number,
  reason: string,
  source: "ADMIN" | "BUYER" | "EVENT_CANCELLED" = "ADMIN",
  bank?: RefundBankInput,
) {
  const why = reason.trim();
  if (why.length < 10) throw new AppError("VALIDATION_ERROR", "Alasan wajib minimal 10 karakter.", {}, 400);
  if (!Number.isInteger(amount) || amount <= 0) throw new AppError("VALIDATION_ERROR", "Nominal tidak valid.", {}, 400);
  let bankName: string | null = null;
  let accountName: string | null = null;
  let accountNumber: string | null = null;
  if (source === "BUYER") {
    const parsed = parseRefundBank(bank || {});
    if (!isParsedRefundBank(parsed)) {
      throw new AppError("VALIDATION_ERROR", parsed.error, { [parsed.field]: parsed.error }, 400);
    }
    bankName = parsed.bankName;
    accountName = parsed.accountName;
    accountNumber = parsed.accountNumber;
  }
  await assertUnusedOnly(orderId);
  const p = await paidPayment(orderId);
  const outstanding = await outstandingRupiah(orderId);
  const left = remainingRefundable(Number(p.amount_rupiah), outstanding);
  if (amount > left) throw new AppError("REFUND_AMOUNT_INVALID", "Nominal refund melebihi sisa yang dapat dikembalikan.", {}, 400);
  const id = newId();
  const refundNumber = `RFND-${id.replace(/-/g, "").slice(0, 12).toUpperCase()}`;
  await execute(
    `INSERT INTO refunds (id, refund_number, order_id, payment_id, amount_rupiah, reason, status, source, requested_by_user_id,
            bank_name, bank_account_name, bank_account_number, requested_at, created_at, updated_at, version)
     VALUES ($1,$2,$3,$4,$5,$6,'REQUESTED'::refund_status,$8,$7,$9,$10,$11,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,1)`,
    [id, refundNumber, orderId, p.id, amount, why, actorId, source, bankName, accountName, accountNumber],
  );
  const waitNote =
    source === "BUYER"
      ? `Pengajuan pembatalan pembeli ${refundNumber}: 75% (Rp${amount.toLocaleString("id-ID")}) menunggu keputusan. 25% tidak dikembalikan. Sandbox.`
      : `Pengajuan refund ${refundNumber} sebesar Rp${amount.toLocaleString("id-ID")} menunggu keputusan. Sandbox, bukan transfer uang.`;
  await notifyRefund(orderId, id, refundNumber, "REQUESTED", waitNote);
  const rows = await query<RefundRow>(
    `SELECT ${REFUND_COLS} FROM refunds rf WHERE rf.id=$1`,
    [id],
  );
  if (!rows[0]) throw new AppError("INTERNAL_ERROR", "Terjadi kesalahan internal.", {}, 500);
  return refundDto(rows[0]);
}

export async function requestRefund(adminId: string, orderId: string, amount: number, reason: string) {
  return insertRefund(orderId, adminId, amount, reason, "ADMIN");
}

export async function requestBuyerRefund(buyerId: string, orderId: string, reason: string, bank?: RefundBankInput) {
  const p = await paidPayment(orderId);
  const owner = await query<{ buyer_user_id: string }>(`SELECT buyer_user_id FROM orders WHERE id=$1 LIMIT 1`, [orderId]);
  if (!owner[0] || owner[0].buyer_user_id !== buyerId) {
    throw new AppError("NOT_FOUND", "Order tidak ditemukan.", {}, 404);
  }
  const unused = await query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM tickets WHERE order_id=$1 AND status='UNUSED'::ticket_status`,
    [orderId],
  );
  if (Number(unused[0]?.n || 0) < 1) {
    throw new AppError("REFUND_NOT_ALLOWED", "Tidak ada tiket yang dapat dibatalkan.", {}, 409);
  }
  const priorBuyer = await query<RefundRow>(
    `SELECT ${REFUND_COLS}
     FROM refunds rf WHERE rf.order_id=$1 AND rf.source='BUYER' AND rf.status IN ('REQUESTED','APPROVED','PROCESSING','COMPLETED')
     ORDER BY created_at DESC LIMIT 1`,
    [orderId],
  );
  if (priorBuyer[0]) return refundDto(priorBuyer[0]);
  const outstanding = await outstandingRupiah(orderId);
  const remaining = remainingRefundable(Number(p.amount_rupiah), outstanding);
  const amount = buyerCancelRefundAmount(remaining);
  if (amount <= 0) throw new AppError("REFUND_NOT_ALLOWED", "Sisa pembayaran terlalu kecil untuk refund 75%.", {}, 409);
  return insertRefund(orderId, buyerId, amount, reason, "BUYER", bank);
}

export async function decideRefund(adminId: string, refundId: string, decision: string, reason: string) {
  const why = reason.trim();
  if (why.length < 10) throw new AppError("VALIDATION_ERROR", "Alasan wajib minimal 10 karakter.", {}, 400);
  const d = decision.trim().toUpperCase();
  if (d === "APPROVE" || d === "APPROVED") {
    const found = await query<{ order_id: string; source: string }>(
      `SELECT order_id, COALESCE(source,'ADMIN') AS source FROM refunds rf WHERE rf.id=$1 LIMIT 1`,
      [refundId],
    );
    if (!found[0]) throw new AppError("NOT_FOUND", "Refund tidak ditemukan.", {}, 404);
    await assertUnusedOnly(found[0].order_id);
    const holdBuyer = found[0].source === "BUYER";
    const n = await execute(
      holdBuyer
        ? `UPDATE refunds SET status='APPROVED'::refund_status, decided_by_user_id=$1, decided_at=CURRENT_TIMESTAMP, decision_reason=$2,
                transfer_due_at=CURRENT_TIMESTAMP + INTERVAL '24 hours',
                updated_at=CURRENT_TIMESTAMP, version=version+1
           WHERE id=$3 AND status='REQUESTED'::refund_status`
        : `UPDATE refunds SET status='APPROVED'::refund_status, decided_by_user_id=$1, decided_at=CURRENT_TIMESTAMP, decision_reason=$2,
                updated_at=CURRENT_TIMESTAMP, version=version+1
           WHERE id=$3 AND status='REQUESTED'::refund_status`,
      [adminId, why, refundId],
    );
    if (!n) throw new AppError("EVENT_STATUS_INVALID", "Refund tidak dapat diputuskan.", {}, 409);
    if (holdBuyer) {
      await cancelUnusedTickets(found[0].order_id, null, "REFUND_COMPLETED", refundId);
      const rows = await query<RefundRow>(`SELECT ${REFUND_COLS} FROM refunds rf WHERE rf.id=$1`, [refundId]);
      const r = rows[0];
      if (!r) throw new AppError("NOT_FOUND", "Refund tidak ditemukan.", {}, 404);
      await notifyRefund(
        r.order_id,
        r.id,
        r.refund_number,
        "APPROVED",
        `Refund ${r.refund_number} disetujui. Menunggu transfer sandbox paling lambat 1×24 jam. Tiket sudah tidak berlaku.`,
      );
      return refundDto(r);
    }
    return completeSandboxRefund(refundId);
  }
  if (d === "REJECT" || d === "REJECTED") {
    const n = await execute(
      `UPDATE refunds SET status='REJECTED'::refund_status, decided_by_user_id=$1, decided_at=CURRENT_TIMESTAMP, decision_reason=$2,
              updated_at=CURRENT_TIMESTAMP, version=version+1
       WHERE id=$3 AND status='REQUESTED'::refund_status`,
      [adminId, why, refundId],
    );
    if (!n) throw new AppError("EVENT_STATUS_INVALID", "Refund tidak dapat diputuskan.", {}, 409);
    const rows = await query<RefundRow>(
      `SELECT ${REFUND_COLS} FROM refunds rf WHERE rf.id=$1`,
      [refundId],
    );
    const r = rows[0];
    if (!r) throw new AppError("NOT_FOUND", "Refund tidak ditemukan.", {}, 404);
    await notifyRefund(r.order_id, r.id, r.refund_number, "REJECTED", `Refund ${r.refund_number} ditolak. ${why.slice(0, 400)}`);
    return refundDto(r);
  }
  throw new AppError("VALIDATION_ERROR", "Keputusan tidak valid.", {}, 400);
}

export async function listRefunds(limit = 40) {
  const n = Math.min(Math.max(limit || 40, 1), 80);
  const rows = await query<RefundRow & { order_number: string }>(
    `SELECT ${REFUND_COLS}, o.order_number
     FROM refunds rf JOIN orders o ON o.id = rf.order_id
     ORDER BY rf.created_at DESC, rf.id DESC
     LIMIT $1`,
    [n],
  );
  return rows.map((r) => ({ ...refundDto(r), orderNumber: r.order_number }));
}

export async function listAdminRefunds(limit = 80) {
  const n = Math.min(Math.max(limit || 80, 1), 100);
  const rows = await query<
    RefundRow & { order_number: string; event_title: string; event_id: string; organizer_name: string; organizer_profile_id: string }
  >(
    `SELECT ${REFUND_COLS}, o.order_number, e.id AS event_id, e.title AS event_title,
            op.id AS organizer_profile_id, op.name AS organizer_name
     FROM refunds rf
     JOIN orders o ON o.id = rf.order_id
     JOIN events e ON e.id = o.event_id
     JOIN organizer_profiles op ON op.id = e.organizer_profile_id
     ORDER BY rf.created_at DESC, rf.id DESC
     LIMIT $1`,
    [n],
  );
  const items = rows.map((r) => {
    const base = refundDto(r);
    const flag = refundOversightFlag({
      status: base.status,
      requestedAt: base.requestedAt,
      transferDueAt: base.transferDueAt,
    });
    return {
      ...base,
      orderNumber: r.order_number,
      eventId: r.event_id,
      eventTitle: r.event_title,
      organizerName: r.organizer_name,
      organizerProfileId: r.organizer_profile_id,
      oversightFlag: flag,
    };
  });
  const attention = items.filter((i) => i.oversightFlag).length;
  const awaitingReview = items.filter((i) => i.status === "REQUESTED").length;
  const awaitingTransfer = items.filter((i) => i.status === "APPROVED" || i.status === "PROCESSING").length;
  const overdueTransfer = items.filter((i) => i.oversightFlag === "transfer_overdue").length;
  return {
    items,
    summary: { attention, awaitingReview, awaitingTransfer, overdueTransfer, total: items.length },
    sandbox: true,
  };
}

export async function listOrganizerRefunds(organizerProfileId: string, limit = 40) {
  const n = Math.min(Math.max(limit || 40, 1), 80);
  const rows = await query<RefundRow & { order_number: string; event_title: string }>(
    `SELECT ${REFUND_COLS}, o.order_number, e.title AS event_title
     FROM refunds rf
     JOIN orders o ON o.id = rf.order_id
     JOIN events e ON e.id = o.event_id
     WHERE e.organizer_profile_id = $1
     ORDER BY rf.created_at DESC, rf.id DESC
     LIMIT $2`,
    [organizerProfileId, n],
  );
  return rows.map((r) => ({ ...refundDto(r), orderNumber: r.order_number, eventTitle: r.event_title }));
}

async function assertOrganizerOwnsRefund(organizerProfileId: string, refundId: string): Promise<void> {
  const rows = await query<{ id: string }>(
    `SELECT rf.id
     FROM refunds rf
     JOIN orders o ON o.id = rf.order_id
     JOIN events e ON e.id = o.event_id
     WHERE rf.id = $1 AND e.organizer_profile_id = $2
     LIMIT 1`,
    [refundId, organizerProfileId],
  );
  if (!rows[0]) throw new AppError("NOT_FOUND", "Refund tidak ditemukan.", {}, 404);
}

export async function decideOrganizerRefund(
  userId: string,
  organizerProfileId: string,
  refundId: string,
  decision: string,
  reason: string,
) {
  await assertOrganizerOwnsRefund(organizerProfileId, refundId);
  return decideRefund(userId, refundId, decision, reason);
}

export async function listOrderRefunds(orderId: string) {
  const rows = await query<RefundRow>(
    `SELECT ${REFUND_COLS}
     FROM refunds rf WHERE rf.order_id=$1 ORDER BY rf.created_at DESC, rf.id DESC`,
    [orderId],
  );
  return rows.map(refundDto);
}

export async function listBuyerRefunds(buyerId: string, limit = 40) {
  const n = Math.min(Math.max(limit || 40, 1), 80);
  const rows = await query<RefundRow & { order_number: string; event_title: string }>(
    `SELECT ${REFUND_COLS}, o.order_number, e.title AS event_title
     FROM refunds rf
     JOIN orders o ON o.id = rf.order_id
     JOIN events e ON e.id = o.event_id
     WHERE o.buyer_user_id = $1
     ORDER BY rf.created_at DESC, rf.id DESC
     LIMIT $2`,
    [buyerId, n],
  );
  return rows.map((r) => ({ ...refundDto(r), orderNumber: r.order_number, eventTitle: r.event_title }));
}

export async function listBuyerEligibleOrders(buyerId: string) {
  const rows = await query<{
    id: string;
    order_number: string;
    total_payable_rupiah: string;
    event_title: string;
  }>(
    `SELECT o.id, o.order_number, o.total_payable_rupiah::text, e.title AS event_title
     FROM orders o
     JOIN events e ON e.id = o.event_id
     JOIN payments p ON p.order_id = o.id
     WHERE o.buyer_user_id = $1
       AND o.status = 'PAID'::order_status
       AND p.status = 'SUCCEEDED'::payment_status
       AND EXISTS (SELECT 1 FROM tickets t WHERE t.order_id = o.id AND t.status = 'UNUSED'::ticket_status)
       AND NOT EXISTS (
         SELECT 1 FROM refunds rf
         WHERE rf.order_id = o.id AND rf.source = 'BUYER'
           AND rf.status IN ('REQUESTED','APPROVED','PROCESSING','COMPLETED')
       )
     ORDER BY o.created_at DESC, o.id DESC
     LIMIT 40`,
    [buyerId],
  );
  return rows.map((r) => ({
    id: r.id,
    orderNumber: r.order_number,
    eventTitle: r.event_title,
    totalPayableRupiah: Number(r.total_payable_rupiah),
    estimatedRefundRupiah: buyerCancelRefundAmount(Number(r.total_payable_rupiah)),
  }));
}

async function attachTransferProofAndComplete(refundId: string, proof: Buffer) {
  const current = await query<RefundRow>(`SELECT ${REFUND_COLS} FROM refunds rf WHERE rf.id=$1`, [refundId]);
  const rf = current[0];
  if (!rf) throw new AppError("NOT_FOUND", "Refund tidak ditemukan.", {}, 404);
  if (rf.status !== "APPROVED" && rf.status !== "PROCESSING") {
    throw new AppError("REFUND_NOT_ALLOWED", "Unggah bukti hanya setelah refund disetujui.", {}, 409);
  }
  const url = await saveGalleryFile(proof);
  const name = url.replace(/^.*\//, "");
  const n = await execute(
    `UPDATE refunds SET transfer_proof_name=$2, transferred_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, version=version+1
     WHERE id=$1 AND status IN ('APPROVED'::refund_status,'PROCESSING'::refund_status)`,
    [refundId, name],
  );
  if (!n) throw new AppError("REFUND_NOT_ALLOWED", "Bukti transfer tidak dapat disimpan.", {}, 409);
  return completeSandboxRefund(refundId);
}

export async function confirmOrganizerTransfer(
  _userId: string,
  organizerProfileId: string,
  refundId: string,
  proof: Buffer,
) {
  await assertOrganizerOwnsRefund(organizerProfileId, refundId);
  return attachTransferProofAndComplete(refundId, proof);
}

export async function confirmAdminTransfer(adminId: string, refundId: string, proof: Buffer) {
  if (!adminId) throw new AppError("FORBIDDEN", "Anda tidak memiliki akses.", {}, 403);
  const done = await attachTransferProofAndComplete(refundId, proof);
  const owner = await query<{ owner_user_id: string }>(
    `SELECT op.owner_user_id
     FROM refunds rf
     JOIN orders o ON o.id = rf.order_id
     JOIN events e ON e.id = o.event_id
     JOIN organizer_profiles op ON op.id = e.organizer_profile_id
     WHERE rf.id = $1 LIMIT 1`,
    [refundId],
  );
  if (owner[0]) {
    await notify({
      recipientUserId: owner[0].owner_user_id,
      type: "REFUND_UPDATED",
      title: "Admin menyelesaikan refund (eskalasi)",
      body: `Refund ${done.refundNumber} diselesaikan platform karena SLA transfer. Sandbox, bukan uang nyata.`,
      actionPath: `/dashboard/refunds?refund=${refundId}`,
      entityType: "Refund",
      entityId: refundId,
      deduplicationKey: `refund-org-admin:${refundId}:COMPLETED`,
      domainEventId: `refund:${refundId}:admin-complete`,
    });
  }
  return done;
}

export async function readRefundProof(userId: string, role: string, refundId: string) {
  const rows = await query<RefundRow & { buyer_user_id: string; organizer_profile_id: string }>(
    `SELECT ${REFUND_COLS}, o.buyer_user_id, e.organizer_profile_id
     FROM refunds rf
     JOIN orders o ON o.id = rf.order_id
     JOIN events e ON e.id = o.event_id
     WHERE rf.id = $1
     LIMIT 1`,
    [refundId],
  );
  const row = rows[0];
  if (!row) throw new AppError("NOT_FOUND", "Refund tidak ditemukan.", {}, 404);
  let organizerOk = false;
  if (role !== "ADMIN" && row.buyer_user_id !== userId) {
    const org = await query<{ id: string }>(
      `SELECT id FROM organizer_profiles WHERE owner_user_id=$1 LIMIT 1`,
      [userId],
    );
    organizerOk = org[0]?.id === row.organizer_profile_id;
  }
  const allowed = role === "ADMIN" || row.buyer_user_id === userId || organizerOk;
  if (!allowed) throw new AppError("NOT_FOUND", "Refund tidak ditemukan.", {}, 404);
  if (!row.transfer_proof_name) throw new AppError("NOT_FOUND", "Bukti transfer belum tersedia.", {}, 404);
  const file = await readGalleryFile(row.transfer_proof_name);
  if (!file) throw new AppError("NOT_FOUND", "Bukti transfer belum tersedia.", {}, 404);
  return file;
}

export async function enqueueEventCancelledRefunds(eventId: string, actorId: string, reason: string) {
  await cancelUnusedTickets(null, eventId, "EVENT_CANCELLED", eventId);
  const orders = await query<{ id: string }>(
    `SELECT o.id FROM orders o
     JOIN payments p ON p.order_id=o.id
     WHERE o.event_id=$1 AND o.status='PAID'::order_status AND p.status='SUCCEEDED'::payment_status
     ORDER BY o.id`,
    [eventId],
  );
  const why = `${reason.trim()} Event dibatalkan; refund sandbox otomatis.`;
  for (const row of orders) {
    try {
      const used = await query<{ n: string }>(
        `SELECT COUNT(*)::text AS n FROM tickets WHERE order_id=$1 AND status='USED'::ticket_status`,
        [row.id],
      );
      if (Number(used[0]?.n || 0) > 0) continue;
      const pay = await paidPayment(row.id);
      const amount = remainingRefundable(Number(pay.amount_rupiah), await outstandingRupiah(row.id));
      if (amount <= 0) continue;
      const created = await insertRefund(row.id, actorId, amount, why.slice(0, 1000), "EVENT_CANCELLED");
      await execute(
        `UPDATE refunds SET status='APPROVED'::refund_status, decided_by_user_id=$1, decided_at=CURRENT_TIMESTAMP,
                decision_reason=$2, updated_at=CURRENT_TIMESTAMP, version=version+1
         WHERE id=$3 AND status='REQUESTED'::refund_status`,
        [actorId, "Disetujui otomatis karena event dibatalkan (sandbox).", created.id],
      );
      await completeSandboxRefund(created.id);
    } catch {
      /* event cancel must not fail because one refund row failed */
    }
  }
}
