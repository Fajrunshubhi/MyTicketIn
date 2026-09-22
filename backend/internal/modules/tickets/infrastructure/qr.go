package infrastructure

import (
	"bytes"
	"image/png"

	"github.com/skip2/go-qrcode"
	ticketdomain "myticketin/internal/modules/tickets/domain"
)

type QRRenderer struct{}

func (QRRenderer) PNG(token string, size int) ([]byte, error) {
	if size <= 0 {
		size = 320
	}
	code, err := qrcode.New(token, qrcode.Medium)
	if err != nil {
		return nil, ticketdomain.ErrCryptoFailed
	}
	code.DisableBorder = false
	img := code.Image(size)
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		return nil, ticketdomain.ErrCryptoFailed
	}
	return buf.Bytes(), nil
}
