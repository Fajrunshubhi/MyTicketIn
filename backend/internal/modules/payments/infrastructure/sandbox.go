package infrastructure

import (
	"encoding/json"
	"errors"
	"strings"
	"time"

	"myticketin/internal/modules/payments/domain"
)

// HMACSandbox is an in-process sandbox adapter (no third-party payment SDK).
type HMACSandbox struct {
	Secret string
}

func (a HMACSandbox) CreatePayment(merchantRef string, amount int64, method domain.Method, expiresAt time.Time, idempotencyKey string) (domain.CreateResult, error) {
	if amount < 0 {
		return domain.CreateResult{}, domain.ErrAmountMismatch
	}
	ref := "sbx_" + merchantRef
	if len(ref) > 80 {
		ref = ref[:80]
	}
	_ = idempotencyKey
	return domain.CreateResult{
		ExternalReference: ref,
		Status:            domain.StatusPending,
		Instructions:      domain.Instructions(method, ref, amount, expiresAt),
		ProviderExpiresAt: &expiresAt,
	}, nil
}

func (a HMACSandbox) VerifyWebhook(rawBody []byte, headers map[string]string, receivedAt time.Time) (domain.VerifiedWebhook, error) {
	if len(rawBody) == 0 || len(rawBody) > 256*1024 {
		return domain.VerifiedWebhook{}, domain.ErrMalformed
	}
	sig := headers["X-Sandbox-Signature"]
	if sig == "" {
		sig = headers["x-sandbox-signature"]
	}
	hash := domain.PayloadHash(rawBody)
	if !domain.SignatureOK(a.Secret, sig, rawBody) {
		return domain.VerifiedWebhook{Valid: false, EventID: "invalid_" + hash, PayloadHash: hash}, nil
	}
	var body struct {
		EventID           string `json:"eventId"`
		EventType         string `json:"eventType"`
		ExternalReference string `json:"externalReference"`
		AmountRupiah      int64  `json:"amountRupiah"`
		Currency          string `json:"currency"`
	}
	if err := json.Unmarshal(rawBody, &body); err != nil || strings.TrimSpace(body.EventID) == "" || strings.TrimSpace(body.EventType) == "" {
		return domain.VerifiedWebhook{}, domain.ErrMalformed
	}
	if body.Currency != "" && body.Currency != "IDR" {
		return domain.VerifiedWebhook{}, domain.ErrAmountMismatch
	}
	_ = receivedAt
	return domain.VerifiedWebhook{
		Valid: true, EventID: body.EventID, ExternalReference: body.ExternalReference,
		EventType: body.EventType, AmountRupiah: body.AmountRupiah, PayloadHash: hash,
		SafePayload: map[string]any{"eventType": body.EventType, "amountRupiah": body.AmountRupiah, "sandbox": true},
	}, nil
}

func (a HMACSandbox) RefundSandbox(externalPaymentRef, refundRef string, amount int64, reason string) (string, domain.Status, string, error) {
	if amount <= 0 || strings.TrimSpace(externalPaymentRef) == "" {
		return "", "", "", domain.ErrRefundAmount
	}
	_ = reason
	ref := "sbr_" + refundRef
	raw := domain.MustJSON(map[string]any{"refund": ref, "amountRupiah": amount})
	return ref, domain.StatusPending, domain.PayloadHash(raw), nil
}

func (a HMACSandbox) SecretValue() string { return a.Secret }

func (a HMACSandbox) GetPaymentStatusSandbox(externalRef string) (domain.Status, error) {
	if strings.TrimSpace(externalRef) == "" {
		return "", errors.New("missing")
	}
	return domain.StatusPending, nil
}
