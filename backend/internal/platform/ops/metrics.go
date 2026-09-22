package ops

import (
	"strings"
	"sync"
	"time"
)

type sample struct {
	at      time.Time
	status  int
	ms      int64
	route   string
	outcome string
}

type Window struct {
	mu      sync.Mutex
	samples []sample
	max     int
}

var Process = NewWindow()

func NewWindow() *Window {
	return &Window{max: 4000}
}

func (w *Window) Observe(route string, status int, ms int64, outcome string) {
	if w == nil {
		return
	}
	w.mu.Lock()
	defer w.mu.Unlock()
	w.samples = append(w.samples, sample{at: time.Now().UTC(), status: status, ms: ms, route: route, outcome: outcome})
	if len(w.samples) > w.max {
		w.samples = w.samples[len(w.samples)-w.max:]
	}
}

type Snapshot struct {
	RequestErrorRate       float64
	RecommendationP95      float64
	AIProviderFailures     int
	AIDegradedCount        int
	LoyaltyReplayConflicts int
}

func (w *Window) Snapshot(since time.Duration) Snapshot {
	out := Snapshot{}
	if w == nil {
		return out
	}
	w.mu.Lock()
	defer w.mu.Unlock()
	cut := time.Now().UTC().Add(-since)
	total, errN := 0, 0
	var rec []int64
	for _, s := range w.samples {
		if s.at.Before(cut) {
			continue
		}
		total++
		if s.status >= 500 {
			errN++
		}
		if strings.Contains(s.route, "/recommendations") {
			rec = append(rec, s.ms)
		}
	}
	if total > 0 {
		out.RequestErrorRate = float64(errN) / float64(total)
	}
	out.RecommendationP95 = percentile(rec, 0.95)
	return out
}

func percentile(in []int64, p float64) float64 {
	if len(in) == 0 {
		return 0
	}
	cp := append([]int64(nil), in...)
	for i := 0; i < len(cp); i++ {
		for j := i + 1; j < len(cp); j++ {
			if cp[j] < cp[i] {
				cp[i], cp[j] = cp[j], cp[i]
			}
		}
	}
	idx := int(float64(len(cp)-1) * p)
	return float64(cp[idx])
}
