package main

import (
	"log/slog"
	"os"
	"path/filepath"

	"myticketin/internal/platform/db"
	"myticketin/internal/platform/env"
)

func main() {
	cfg, err := env.Load()
	if err != nil {
		slog.Error("config invalid", "err", err.Error())
		os.Exit(1)
	}
	dir := os.Getenv("MIGRATIONS_DIR")
	if dir == "" {
		wd, err := os.Getwd()
		if err != nil {
			slog.Error("workdir")
			os.Exit(1)
		}
		candidates := []string{
			filepath.Join(wd, "migrations"),
			filepath.Join(wd, "..", "migrations"),
			filepath.Join(wd, "..", "..", "migrations"),
		}
		dir = candidates[0]
		for _, c := range candidates {
			if _, err := os.Stat(c); err == nil {
				dir = c
				break
			}
		}
	}
	if err := db.MigrateUp(cfg.DatabaseURLUnpooled, dir); err != nil {
		slog.Error("migrate failed", "err", err.Error())
		os.Exit(1)
	}
	slog.Info("migrate complete", "env", cfg.AppEnv)
}
