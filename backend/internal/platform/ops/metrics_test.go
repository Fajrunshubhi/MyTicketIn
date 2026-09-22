package ops

import (
	"testing"
	"time"
)

func TestWindowErrorRate(t *testing.T) {
	w := NewWindow()
	w.Observe("/api/x", 200, 10, "ok")
	w.Observe("/api/x", 500, 20, "error")
	s := w.Snapshot(time.Minute)
	if s.RequestErrorRate < 0.4 || s.RequestErrorRate > 0.6 {
		t.Fatalf("%v", s.RequestErrorRate)
	}
}
