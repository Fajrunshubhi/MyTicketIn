package infrastructure

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	loyaltydomain "myticketin/internal/modules/loyalty/domain"
	"myticketin/internal/modules/orders/domain"
	platdb "myticketin/internal/platform/db"
)

func (s *Store) IncrementPaid(ctx context.Context, ticketID string, n int) error {
	tag, err := exec(ctx, s, `UPDATE event_ticket_types SET reserved_quantity = reserved_quantity - $2, paid_quantity = paid_quantity + $2, updated_at = CURRENT_TIMESTAMP, version = version + 1
		WHERE id=$1 AND reserved_quantity >= $2`, ticketID, n)
	if err != nil {
		return err
	}
	if cmd, ok := tag.(pgconn.CommandTag); ok && cmd.RowsAffected() == 0 {
		return domain.ErrInventory
	}
	return nil
}

func (s *Store) ConsumeLoyaltyReservation(ctx context.Context, orderID string) (int64, string, bool, error) {
	var points int64
	var accountID string
	err := rowQ(ctx, s, `UPDATE loyalty_point_reservations SET status='CONSUMED', consumed_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, version=version+1
		WHERE order_id=$1 AND status='ACTIVE' RETURNING points, account_id`, orderID).Scan(&points, &accountID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return 0, "", false, nil
		}
		return 0, "", false, err
	}
	return points, accountID, true, nil
}

func (s *Store) AdjustLoyaltyAccount(ctx context.Context, acc loyaltydomain.Account) error {
	_, err := exec(ctx, s, `UPDATE loyalty_accounts SET balance_points=$2, debt_points=$3, reserved_points=$4, updated_at=CURRENT_TIMESTAMP, version=version+1 WHERE id=$1 AND version=$5`,
		acc.ID, acc.BalancePoints, acc.DebtPoints, acc.ReservedPoints, acc.Version)
	return err
}

func (s *Store) InsertLedger(ctx context.Context, accountID, entryType string, delta int64, sourceKey, orderID string, refundID *string, balanceAfter, debtAfter int64, corr string) error {
	id, err := platdb.NewID()
	if err != nil {
		return err
	}
	_, err = exec(ctx, s, `INSERT INTO loyalty_ledger_entries (id,account_id,entry_type,points_delta,source_key,order_id,refund_id,balance_points_after,debt_points_after,actor_type,correlation_id)
		VALUES ($1,$2,$3::loyalty_entry_type,$4,$5,$6,$7,$8,$9,'SYSTEM',$10)`,
		id, accountID, entryType, delta, sourceKey, orderID, refundID, balanceAfter, debtAfter, corr)
	return mapErr(err)
}

func (s *Store) MarkOrderPaid(ctx context.Context, o domain.Order, earned int64, now time.Time) error {
	tag, err := exec(ctx, s, `UPDATE orders SET status='PAID', loyalty_earned_points=$2, paid_at=$3, updated_at=CURRENT_TIMESTAMP, version=version+1
		WHERE id=$1 AND status='PENDING' AND expires_at > statement_timestamp()`, o.ID, earned, now)
	if err != nil {
		return err
	}
	if cmd, ok := tag.(pgconn.CommandTag); ok && cmd.RowsAffected() == 0 {
		return domain.ErrConflict
	}
	return nil
}

func (s *Store) MarkOrderRefunded(ctx context.Context, o domain.Order, now time.Time) error {
	_ = now
	_, err := exec(ctx, s, `UPDATE orders SET status=$2::order_status, loyalty_reversed_points=$3, loyalty_redeemed_restored=$4, updated_at=CURRENT_TIMESTAMP, version=version+1 WHERE id=$1`,
		o.ID, string(o.Status), o.LoyaltyReversedPoints, o.LoyaltyRedeemedRestored)
	return err
}
