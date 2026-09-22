package domain

import "errors"

const (
	RupiahPerPoint        int64 = 10
	MaxCheckoutPercent          = 20
	MaxOrderSubtotal      int64 = 9_000_000_000_000
	MaxRedeemPoints       int64 = 180_000_000_000
	ReservationActive           = "ACTIVE"
	ReservationConsumed         = "CONSUMED"
	ReservationReleased         = "RELEASED"
	ReleaseOrderExpired         = "ORDER_EXPIRED"
	ReleaseOrderFailed          = "ORDER_FAILED"
	ReleaseOrderCancelled       = "ORDER_CANCELLED"
	ReleaseEventCancelled       = "EVENT_CANCELLED"
	ReleasePaymentFailed        = "PAYMENT_FAILED"
	ReleasePaymentExpired       = "PAYMENT_EXPIRED"
)

var (
	ErrInsufficient      = errors.New("LOYALTY_INSUFFICIENT_POINTS")
	ErrRedemptionLimit   = errors.New("LOYALTY_REDEMPTION_LIMIT_EXCEEDED")
	ErrAccountNotFound   = errors.New("LOYALTY_ACCOUNT_NOT_FOUND")
	ErrOrganizerMismatch = errors.New("LOYALTY_ORGANIZER_MISMATCH")
	ErrConflict          = errors.New("LOYALTY_CONFLICT")
	ErrInvalid           = errors.New("LOYALTY_INVALID")
)

type Account struct {
	ID                 string
	BuyerUserID        string
	OrganizerProfileID string
	BalancePoints      int64
	DebtPoints         int64
	ReservedPoints     int64
	Version            int
}

func MaxDiscountRupiah(subtotal int64) int64 {
	if subtotal < 0 {
		return 0
	}
	return subtotal / 5
}

func MaxRedeemablePoints(subtotal int64) int64 {
	return MaxDiscountRupiah(subtotal) / RupiahPerPoint
}

func AvailablePoints(balance, reserved, debt int64) int64 {
	v := balance - reserved - debt
	if v < 0 {
		return 0
	}
	return v
}

func DiscountRupiah(points int64) int64 {
	return points * RupiahPerPoint
}

// ApplyRedeem validates requested points against cap and available balance.
// Zero request always succeeds with no discount.
func ApplyRedeem(requested, subtotal, available int64) (applied, discount int64, err error) {
	if requested < 0 || subtotal < 0 || subtotal > MaxOrderSubtotal {
		return 0, 0, ErrInvalid
	}
	if requested == 0 {
		return 0, 0, nil
	}
	if requested > MaxRedeemPoints {
		return 0, 0, ErrRedemptionLimit
	}
	capPts := MaxRedeemablePoints(subtotal)
	if requested > capPts {
		return 0, 0, ErrRedemptionLimit
	}
	if requested > available {
		return 0, 0, ErrInsufficient
	}
	return requested, DiscountRupiah(requested), nil
}
