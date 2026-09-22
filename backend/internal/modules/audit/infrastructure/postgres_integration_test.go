package infrastructure

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"testing"

	analyticsapp "myticketin/internal/modules/analytics/application"
	analyticsdomain "myticketin/internal/modules/analytics/domain"
	analyticsinfra "myticketin/internal/modules/analytics/infrastructure"
	auditapp "myticketin/internal/modules/audit/application"
	auditdomain "myticketin/internal/modules/audit/domain"
	"myticketin/internal/modules/auth/application"
	authinfra "myticketin/internal/modules/auth/infrastructure"
	"myticketin/internal/platform/db"
)

type failAudit struct{}

func (failAudit) Record(context.Context, auditdomain.Record) error {
	return auditapp.ErrWriteFailed
}

type failAnalytics struct{}

func (failAnalytics) Insert(context.Context, analyticsdomain.Event) (bool, error) {
	return false, errors.New("unavailable")
}

func openTest(t *testing.T) *db.Pool {
	t.Helper()
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL not set")
	}
	_, thisFile, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("caller")
	}
	migrations := filepath.Join(filepath.Dir(thisFile), "..", "..", "..", "..", "migrations")
	if err := db.MigrateUp(url, migrations); err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	pool, err := db.Open(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	return pool
}

func TestAuditMutationAtomicAndImmutable(t *testing.T) {
	pool := openTest(t)
	ctx := context.Background()
	users := authinfra.NewStore(pool)
	auditStore := NewStore(pool)
	writer := &auditapp.Writer{Store: auditStore}
	h := application.StaticHasher{
		HashFn:    func(p string) (string, error) { return "h:" + p, nil },
		CompareFn: func(hash, password string) bool { return hash == "h:"+password },
	}

	svc := application.NewService(users, users, users, h)
	svc.UoW = pool.InTx
	svc.Audit = writer
	suffix, _ := db.NewID()
	u, err := svc.Register(ctx, "Nama User", "u"+suffix[:10], "u"+suffix[:10]+"@example.test", "password12", "password12", "127.0.0.1")
	if err != nil {
		t.Fatal(err)
	}
	rows, err := auditStore.List(ctx, auditdomain.Filter{EntityID: u.ID, Limit: 10})
	if err != nil || len(rows) == 0 {
		t.Fatalf("audit missing %v %d", err, len(rows))
	}

	_, err = pool.Raw().Exec(ctx, `UPDATE audit_logs SET action = 'x' WHERE id = $1`, rows[0].ID)
	if err == nil {
		t.Fatal("update must be rejected")
	}
	_, err = pool.Raw().Exec(ctx, `DELETE FROM audit_logs WHERE id = $1`, rows[0].ID)
	if err == nil {
		t.Fatal("delete must be rejected")
	}

	failing := application.NewService(users, users, users, h)
	failing.UoW = pool.InTx
	failing.Audit = failAudit{}
	suffix2, _ := db.NewID()
	username := "f" + suffix2[:10]
	_, err = failing.Register(ctx, "Nama User", username, username+"@example.test", "password12", "password12", "127.0.0.2")
	if err == nil {
		t.Fatal("expected audit failure")
	}
	_, getErr := users.GetByUsernameOrEmail(ctx, username)
	if getErr == nil {
		t.Fatal("user must rollback")
	}
}

func TestAnalyticsDedupAndFailureDoesNotRollback(t *testing.T) {
	pool := openTest(t)
	ctx := context.Background()
	users := authinfra.NewStore(pool)
	aStore := analyticsinfra.NewStore(pool)
	em := &analyticsapp.Emitter{Store: aStore, Metrics: &analyticsapp.Metrics{}}
	h := application.StaticHasher{
		HashFn:    func(p string) (string, error) { return "h:" + p, nil },
		CompareFn: func(hash, password string) bool { return hash == "h:"+password },
	}
	svc := application.NewService(users, users, users, h)
	svc.UoW = pool.InTx
	svc.Analytics = em
	suffix, _ := db.NewID()
	u, err := svc.Register(ctx, "Nama User", "a"+suffix[:10], "a"+suffix[:10]+"@example.test", "password12", "password12", "127.0.0.3")
	if err != nil {
		t.Fatal(err)
	}
	key := "dedup-" + suffix[:8]
	in := analyticsapp.Input{Name: "ticket_viewed", SchemaVersion: 1, DeduplicationKey: key, Client: true, AnonymousSeed: "ip", Properties: map[string]any{"source": "web"}}
	if err := em.Emit(ctx, in); err != nil {
		t.Fatal(err)
	}
	if err := em.Emit(ctx, in); err != nil {
		t.Fatal(err)
	}
	var n int
	if err := pool.Raw().QueryRow(ctx, `SELECT COUNT(*) FROM analytics_events WHERE deduplication_key = $1`, key).Scan(&n); err != nil || n != 1 {
		t.Fatalf("dedup %d %v", n, err)
	}

	svc2 := application.NewService(users, users, users, h)
	svc2.UoW = pool.InTx
	svc2.Analytics = &analyticsapp.Emitter{Store: failAnalytics{}, Metrics: &analyticsapp.Metrics{}}
	suffix3, _ := db.NewID()
	u2, err := svc2.Register(ctx, "Nama User", "b"+suffix3[:10], "b"+suffix3[:10]+"@example.test", "password12", "password12", "127.0.0.4")
	if err != nil {
		t.Fatal(err)
	}
	got, err := users.GetByID(ctx, u2.ID)
	if err != nil || got.ID != u2.ID {
		t.Fatal("analytics failure must not rollback user")
	}
	_ = u
}
