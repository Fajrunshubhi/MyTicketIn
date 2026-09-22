package infrastructure

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	orderdomain "myticketin/internal/modules/orders/domain"
	"myticketin/internal/modules/payments/domain"
	platdb "myticketin/internal/platform/db"
)

type Store struct {
	pool *pgxpool.Pool
}

func NewStore(pool *platdb.Pool) *Store { return &Store{pool: pool.Raw()} }

const payCols = `id,order_id,provider,environment,external_reference,provider_idempotency_key,method::text,amount_rupiah,currency,status::text,instruction_data,failure_code,provider_expires_at,succeeded_at,failed_at,refunded_at,created_at,updated_at,version`

func (s *Store) Insert(ctx context.Context, p domain.Payment) error {
	inst, _ := json.Marshal(p.InstructionData)
	_, err := exec(ctx, s, `INSERT INTO payments (
		id,order_id,provider,environment,external_reference,provider_idempotency_key,method,amount_rupiah,currency,status,instruction_data,provider_expires_at,created_at,updated_at,version
	) VALUES ($1,$2,$3,$4,$5,$6,$7::payment_method,$8,$9,$10::payment_status,$11::jsonb,$12,$13,$14,1)`,
		p.ID, p.OrderID, p.Provider, p.Environment, p.ExternalReference, p.ProviderIdempotencyKey, string(p.Method), p.AmountRupiah, p.Currency, string(p.Status), jsonText(inst), p.ProviderExpiresAt, p.CreatedAt, p.UpdatedAt)
	return mapErr(err)
}

func (s *Store) Update(ctx context.Context, p domain.Payment) error {
	inst, _ := json.Marshal(p.InstructionData)
	_, err := exec(ctx, s, `UPDATE payments SET external_reference=$2, status=$3::payment_status, instruction_data=$4::jsonb, failure_code=$5, provider_expires_at=$6, succeeded_at=$7, failed_at=$8, refunded_at=$9, updated_at=CURRENT_TIMESTAMP, version=version+1 WHERE id=$1`,
		p.ID, p.ExternalReference, string(p.Status), jsonText(inst), p.FailureCode, p.ProviderExpiresAt, p.SucceededAt, p.FailedAt, p.RefundedAt)
	return mapErr(err)
}

func (s *Store) Get(ctx context.Context, id string) (domain.Payment, error) {
	return scanPay(rowQ(ctx, s, `SELECT `+payCols+` FROM payments WHERE id=$1`, id))
}

func (s *Store) GetForUpdate(ctx context.Context, id string) (domain.Payment, error) {
	return scanPay(rowQ(ctx, s, `SELECT `+payCols+` FROM payments WHERE id=$1 FOR UPDATE`, id))
}

func (s *Store) GetByOrder(ctx context.Context, orderID string) (domain.Payment, error) {
	return scanPay(rowQ(ctx, s, `SELECT `+payCols+` FROM payments WHERE order_id=$1`, orderID))
}

func (s *Store) GetByExternal(ctx context.Context, provider, ref string) (domain.Payment, error) {
	return s.GetByExternalForUpdate(ctx, provider, ref)
}

func (s *Store) GetByExternalForUpdate(ctx context.Context, provider, ref string) (domain.Payment, error) {
	return scanPay(rowQ(ctx, s, `SELECT `+payCols+` FROM payments WHERE provider=$1 AND external_reference=$2 FOR UPDATE`, provider, ref))
}

func (s *Store) InsertInbox(ctx context.Context, ev domain.WebhookEvent) (domain.WebhookEvent, bool, error) {
	payload, _ := json.Marshal(ev.SanitizedPayload)
	mapped := any(nil)
	if ev.MappedStatus != nil {
		mapped = string(*ev.MappedStatus)
	}
	tag, err := exec(ctx, s, `INSERT INTO payment_webhook_events (
		id,provider,external_event_id,external_reference,payload_hash,signature_valid,processing_status,mapped_status,reason_code,received_at,processed_at,correlation_id,sanitized_payload
	) VALUES ($1,$2,$3,$4,$5,$6,$7::webhook_processing_status,$8::payment_status,$9,$10,$11,$12,$13::jsonb)
	ON CONFLICT (provider, external_event_id) DO NOTHING`,
		ev.ID, ev.Provider, ev.ExternalEventID, ev.ExternalReference, ev.PayloadHash, ev.SignatureValid, string(ev.ProcessingStatus), mapped, ev.ReasonCode, ev.ReceivedAt, ev.ProcessedAt, ev.CorrelationID, jsonText(payload))
	if err != nil {
		return domain.WebhookEvent{}, false, mapErr(err)
	}
	inserted := false
	if cmd, ok := tag.(pgconn.CommandTag); ok {
		inserted = cmd.RowsAffected() == 1
	}
	cur, err := s.GetInboxForUpdate(ctx, ev.Provider, ev.ExternalEventID)
	return cur, inserted, err
}

func (s *Store) GetInboxForUpdate(ctx context.Context, provider, eventID string) (domain.WebhookEvent, error) {
	return scanInbox(rowQ(ctx, s, `SELECT id,provider,external_event_id,external_reference,payload_hash,signature_valid,processing_status::text,mapped_status::text,reason_code,received_at,processed_at,correlation_id,sanitized_payload
		FROM payment_webhook_events WHERE provider=$1 AND external_event_id=$2 FOR UPDATE`, provider, eventID))
}

func (s *Store) MarkInbox(ctx context.Context, ev domain.WebhookEvent) error {
	payload, _ := json.Marshal(ev.SanitizedPayload)
	mapped := any(nil)
	if ev.MappedStatus != nil {
		mapped = string(*ev.MappedStatus)
	}
	_, err := exec(ctx, s, `UPDATE payment_webhook_events SET processing_status=$2::webhook_processing_status, mapped_status=$3::payment_status, reason_code=$4, processed_at=$5, sanitized_payload=$6::jsonb WHERE id=$1`,
		ev.ID, string(ev.ProcessingStatus), mapped, ev.ReasonCode, ev.ProcessedAt, jsonText(payload))
	return err
}

func (s *Store) InsertRecon(ctx context.Context, rec domain.Reconciliation) error {
	_, err := exec(ctx, s, `INSERT INTO payment_reconciliations (id,payment_id,order_id,webhook_event_id,reason_code,status,provider_amount_rupiah,notes,created_at,updated_at)
		VALUES ($1,$2,$3,$4,$5,$6::reconciliation_status,$7,$8,$9,$10)`,
		rec.ID, rec.PaymentID, rec.OrderID, rec.WebhookEventID, rec.ReasonCode, string(rec.Status), rec.ProviderAmount, rec.Notes, rec.CreatedAt, rec.UpdatedAt)
	return mapErr(err)
}

func (s *Store) ListRecon(ctx context.Context, status string, limit int, cursorAt *time.Time, cursorID string) ([]domain.Reconciliation, error) {
	q := `SELECT r.id,r.payment_id,r.order_id,r.webhook_event_id,r.reason_code,r.status::text,r.provider_amount_rupiah,r.notes,r.resolved_by_user_id,r.resolved_at,r.created_at,r.updated_at,r.version,o.order_number
		FROM payment_reconciliations r JOIN orders o ON o.id=r.order_id WHERE ($1='' OR r.status::text=$1)`
	args := []any{status, limit}
	if cursorAt != nil {
		q += ` AND (r.created_at, r.id) > ($3,$4)`
		args = []any{status, limit, *cursorAt, cursorID}
	}
	q += ` ORDER BY r.created_at, r.id LIMIT $2`
	rows, err := query(ctx, s, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.Reconciliation
	for rows.Next() {
		rec, err := scanRecon(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, rec)
	}
	return out, rows.Err()
}

func (s *Store) GetReconForUpdate(ctx context.Context, id string) (domain.Reconciliation, error) {
	return scanRecon(rowQ(ctx, s, `SELECT r.id,r.payment_id,r.order_id,r.webhook_event_id,r.reason_code,r.status::text,r.provider_amount_rupiah,r.notes,r.resolved_by_user_id,r.resolved_at,r.created_at,r.updated_at,r.version,o.order_number
		FROM payment_reconciliations r JOIN orders o ON o.id=r.order_id WHERE r.id=$1 FOR UPDATE OF r`, id))
}

func (s *Store) UpdateRecon(ctx context.Context, rec domain.Reconciliation) error {
	_, err := exec(ctx, s, `UPDATE payment_reconciliations SET status=$2::reconciliation_status, notes=$3, resolved_by_user_id=$4, resolved_at=$5, updated_at=CURRENT_TIMESTAMP, version=version+1 WHERE id=$1`,
		rec.ID, string(rec.Status), rec.Notes, rec.ResolvedBy, rec.ResolvedAt)
	return err
}

func (s *Store) InsertRefund(ctx context.Context, r domain.Refund) error {
	_, err := exec(ctx, s, `INSERT INTO refunds (id,refund_number,order_id,payment_id,amount_rupiah,reason,status,requested_by_user_id,decided_by_user_id,decision_reason,external_reference,provider_event_id,loyalty_processed_at,requested_at,decided_at,completed_at,created_at,updated_at,version)
		VALUES ($1,$2,$3,$4,$5,$6,$7::refund_status,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,1)`,
		r.ID, r.RefundNumber, r.OrderID, r.PaymentID, r.AmountRupiah, r.Reason, string(r.Status), r.RequestedByUserID, r.DecidedByUserID, r.DecisionReason, r.ExternalReference, r.ProviderEventID, r.LoyaltyProcessedAt, r.RequestedAt, r.DecidedAt, r.CompletedAt, r.CreatedAt, r.UpdatedAt)
	return mapErr(err)
}

func (s *Store) GetRefund(ctx context.Context, id string) (domain.Refund, error) {
	return scanRefund(rowQ(ctx, s, refundSelect()+` WHERE id=$1`, id))
}

func (s *Store) GetRefundForUpdate(ctx context.Context, id string) (domain.Refund, error) {
	return scanRefund(rowQ(ctx, s, refundSelect()+` WHERE id=$1 FOR UPDATE`, id))
}

func (s *Store) GetRefundByExternal(ctx context.Context, paymentID, ref string) (domain.Refund, error) {
	if paymentID == "" {
		return scanRefund(rowQ(ctx, s, refundSelect()+` WHERE external_reference=$1`, ref))
	}
	return scanRefund(rowQ(ctx, s, refundSelect()+` WHERE payment_id=$1 AND external_reference=$2`, paymentID, ref))
}

func (s *Store) UpdateRefund(ctx context.Context, r domain.Refund) error {
	_, err := exec(ctx, s, `UPDATE refunds SET status=$2::refund_status, decided_by_user_id=$3, decision_reason=$4, external_reference=$5, provider_event_id=$6, loyalty_processed_at=$7, decided_at=$8, completed_at=$9, updated_at=CURRENT_TIMESTAMP, version=version+1 WHERE id=$1`,
		r.ID, string(r.Status), r.DecidedByUserID, r.DecisionReason, r.ExternalReference, r.ProviderEventID, r.LoyaltyProcessedAt, r.DecidedAt, r.CompletedAt)
	return err
}

func (s *Store) SumRefunds(ctx context.Context, paymentID string, includeRequested bool) (int64, error) {
	q := `SELECT COALESCE(SUM(amount_rupiah),0) FROM refunds WHERE payment_id=$1 AND status::text <> ALL($2)`
	exclude := []string{"REJECTED", "FAILED"}
	if !includeRequested {
		exclude = append(exclude, "REQUESTED")
	}
	var n int64
	err := rowQ(ctx, s, q, paymentID, exclude).Scan(&n)
	return n, err
}

func (s *Store) SumCompleted(ctx context.Context, orderID string) (int64, error) {
	var n int64
	err := rowQ(ctx, s, `SELECT COALESCE(SUM(amount_rupiah),0) FROM refunds WHERE order_id=$1 AND status='COMPLETED'`, orderID).Scan(&n)
	return n, err
}

func (s *Store) ClaimIdempotency(ctx context.Context, rec orderdomain.Idempotency) (orderdomain.Idempotency, bool, error) {
	_, err := exec(ctx, s, `INSERT INTO idempotency_keys (id,actor_user_id,scope,key_hash,request_hash,status,expires_at,created_at,updated_at)
		VALUES ($1,$2,$3,$4,$5,'PROCESSING', transaction_timestamp() + INTERVAL '24 hours', transaction_timestamp(), transaction_timestamp())
		ON CONFLICT (actor_user_id, scope, key_hash) DO NOTHING`, rec.ID, rec.ActorUserID, rec.Scope, rec.KeyHash, rec.RequestHash)
	if err != nil {
		return orderdomain.Idempotency{}, false, mapErr(err)
	}
	out, err := scanIdem(rowQ(ctx, s, `SELECT id,actor_user_id,scope,key_hash,request_hash,status::text,resource_type,resource_id,http_status,response_body,expires_at FROM idempotency_keys WHERE actor_user_id=$1 AND scope=$2 AND key_hash=$3 FOR UPDATE`, rec.ActorUserID, rec.Scope, rec.KeyHash))
	if err != nil {
		return orderdomain.Idempotency{}, false, err
	}
	return out, out.ID == rec.ID && out.Status == orderdomain.IdempotencyProc, nil
}

func (s *Store) CompleteIdempotency(ctx context.Context, actor, scope, keyHash string, httpStatus int, resourceID string, body []byte) error {
	_, err := exec(ctx, s, `UPDATE idempotency_keys SET status='COMPLETED', resource_type='Payment', resource_id=$4, http_status=$5, response_body=$6::jsonb, updated_at=CURRENT_TIMESTAMP
		WHERE actor_user_id=$1 AND scope=$2 AND key_hash=$3 AND status='PROCESSING'`, actor, scope, keyHash, resourceID, httpStatus, jsonText(body))
	return err
}

func refundSelect() string {
	return `SELECT id,refund_number,order_id,payment_id,amount_rupiah,reason,status::text,requested_by_user_id,decided_by_user_id,decision_reason,external_reference,provider_event_id,loyalty_processed_at,requested_at,decided_at,completed_at,created_at,updated_at,version FROM refunds`
}

func scanPay(row interface{ Scan(dest ...any) error }) (domain.Payment, error) {
	var p domain.Payment
	var method, status string
	var inst []byte
	err := row.Scan(&p.ID, &p.OrderID, &p.Provider, &p.Environment, &p.ExternalReference, &p.ProviderIdempotencyKey, &method, &p.AmountRupiah, &p.Currency, &status, &inst, &p.FailureCode, &p.ProviderExpiresAt, &p.SucceededAt, &p.FailedAt, &p.RefundedAt, &p.CreatedAt, &p.UpdatedAt, &p.Version)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Payment{}, domain.ErrNotFound
	}
	p.Method = domain.Method(method)
	p.Status = domain.Status(status)
	if len(inst) > 0 {
		_ = json.Unmarshal(inst, &p.InstructionData)
	}
	return p, err
}

func scanInbox(row interface{ Scan(dest ...any) error }) (domain.WebhookEvent, error) {
	var ev domain.WebhookEvent
	var mapped *string
	var payload []byte
	err := row.Scan(&ev.ID, &ev.Provider, &ev.ExternalEventID, &ev.ExternalReference, &ev.PayloadHash, &ev.SignatureValid, &ev.ProcessingStatus, &mapped, &ev.ReasonCode, &ev.ReceivedAt, &ev.ProcessedAt, &ev.CorrelationID, &payload)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.WebhookEvent{}, domain.ErrNotFound
	}
	if mapped != nil && *mapped != "" {
		st := domain.Status(*mapped)
		ev.MappedStatus = &st
	}
	if len(payload) > 0 {
		_ = json.Unmarshal(payload, &ev.SanitizedPayload)
	}
	return ev, err
}

func scanRecon(row interface{ Scan(dest ...any) error }) (domain.Reconciliation, error) {
	var rec domain.Reconciliation
	var status string
	err := row.Scan(&rec.ID, &rec.PaymentID, &rec.OrderID, &rec.WebhookEventID, &rec.ReasonCode, &status, &rec.ProviderAmount, &rec.Notes, &rec.ResolvedBy, &rec.ResolvedAt, &rec.CreatedAt, &rec.UpdatedAt, &rec.Version, &rec.OrderNumber)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Reconciliation{}, domain.ErrNotFound
	}
	rec.Status = domain.ReconStatus(status)
	return rec, err
}

func scanRefund(row interface{ Scan(dest ...any) error }) (domain.Refund, error) {
	var r domain.Refund
	var status string
	err := row.Scan(&r.ID, &r.RefundNumber, &r.OrderID, &r.PaymentID, &r.AmountRupiah, &r.Reason, &status, &r.RequestedByUserID, &r.DecidedByUserID, &r.DecisionReason, &r.ExternalReference, &r.ProviderEventID, &r.LoyaltyProcessedAt, &r.RequestedAt, &r.DecidedAt, &r.CompletedAt, &r.CreatedAt, &r.UpdatedAt, &r.Version)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Refund{}, domain.ErrNotFound
	}
	r.Status = domain.RefundStatus(status)
	return r, err
}

func scanIdem(row interface{ Scan(dest ...any) error }) (orderdomain.Idempotency, error) {
	var rec orderdomain.Idempotency
	err := row.Scan(&rec.ID, &rec.ActorUserID, &rec.Scope, &rec.KeyHash, &rec.RequestHash, &rec.Status, &rec.ResourceType, &rec.ResourceID, &rec.HTTPStatus, &rec.ResponseBody, &rec.ExpiresAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return orderdomain.Idempotency{}, domain.ErrNotFound
	}
	return rec, err
}

func mapErr(err error) error {
	if err == nil {
		return nil
	}
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" {
		return domain.ErrTransitionInvalid
	}
	return err
}

func jsonText(b []byte) any {
	if len(b) == 0 {
		return "{}"
	}
	return string(b)
}

func exec(ctx context.Context, s *Store, sql string, args ...any) (any, error) {
	if tx := platdb.TxFrom(ctx); tx != nil {
		return tx.Exec(ctx, sql, args...)
	}
	return s.pool.Exec(ctx, sql, args...)
}

func rowQ(ctx context.Context, s *Store, sql string, args ...any) pgx.Row {
	if tx := platdb.TxFrom(ctx); tx != nil {
		return tx.QueryRow(ctx, sql, args...)
	}
	return s.pool.QueryRow(ctx, sql, args...)
}

func query(ctx context.Context, s *Store, sql string, args ...any) (pgx.Rows, error) {
	if tx := platdb.TxFrom(ctx); tx != nil {
		return tx.Query(ctx, sql, args...)
	}
	return s.pool.Query(ctx, sql, args...)
}
