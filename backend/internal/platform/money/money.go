package money

import (
	"fmt"
	"strings"
)

// FormatIDR formats a non-negative integer Rupiah amount as id-ID currency without fractions.
func FormatIDR(amount int64) (string, error) {
	if amount < 0 {
		return "", fmt.Errorf("amount must be >= 0")
	}
	s := fmt.Sprintf("%d", amount)
	n := len(s)
	if n <= 3 {
		return "Rp" + s, nil
	}
	var b strings.Builder
	b.WriteString("Rp")
	pre := n % 3
	if pre == 0 {
		pre = 3
	}
	b.WriteString(s[:pre])
	for i := pre; i < n; i += 3 {
		b.WriteByte('.')
		b.WriteString(s[i : i+3])
	}
	return b.String(), nil
}
