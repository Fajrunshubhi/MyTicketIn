package clock

import (
	"fmt"
	"time"
)

// FormatInZone renders a UTC instant in an IANA zone and always names the zone.
func FormatInZone(t time.Time, iana string) (string, error) {
	if iana == "" {
		iana = "Asia/Jakarta"
	}
	loc, err := time.LoadLocation(iana)
	if err != nil {
		return "", fmt.Errorf("invalid time zone")
	}
	local := t.In(loc)
	return local.Format("02 Jan 2006 15:04 MST"), nil
}
