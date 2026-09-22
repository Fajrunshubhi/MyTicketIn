package db_test

import (
	"context"
	"os"
	"path/filepath"
	"runtime"
	"testing"

	"myticketin/internal/platform/db"
)

func TestDATAINTUserRepository(t *testing.T) {
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL not set")
	}
	_, thisFile, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("caller")
	}
	migrations := filepath.Join(filepath.Dir(thisFile), "..", "..", "..", "migrations")
	if err := db.MigrateUp(url, migrations); err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	pool, err := db.Open(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	if err := pool.Ping(ctx); err != nil {
		t.Fatal(err)
	}
	repo := db.NewUserRepository(pool)
	suffix, err := db.NewID()
	if err != nil {
		t.Fatal(err)
	}
	username := "u" + suffix[:12]
	email := username + "@example.test"
	created, err := repo.Create(ctx, "Pengguna Uji", username, email, "USER", nil)
	if err != nil {
		t.Fatal(err)
	}
	got, err := repo.GetByID(ctx, created.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got.Username != username || got.Email != email {
		t.Fatalf("got %#v", got)
	}
}
