package db

import (
	"database/sql"
	"fmt"

	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
)

func MigrateUp(unpooledURL, migrationsDir string) error {
	if unpooledURL == "" {
		return fmt.Errorf("CONFIG_INVALID: DATABASE_URL_UNPOOLED")
	}
	if isPoolerHost(unpooledURL) {
		return fmt.Errorf("CONFIG_INVALID: DATABASE_URL_UNPOOLED must be the Neon direct host, not the pooler")
	}
	db, err := sql.Open("pgx", withSimpleProtocol(unpooledURL))
	if err != nil {
		return fmt.Errorf("DATABASE_UNAVAILABLE")
	}
	defer db.Close()
	if err := goose.SetDialect("postgres"); err != nil {
		return err
	}
	if err := adoptExistingUsersBaseline(db); err != nil {
		return err
	}
	if err := goose.Up(db, migrationsDir); err != nil {
		return err
	}
	return nil
}

func adoptExistingUsersBaseline(db *sql.DB) error {
	var exists bool
	if err := db.QueryRow(`
		SELECT EXISTS (
			SELECT 1 FROM information_schema.tables
			WHERE table_schema = 'public' AND table_name = 'users'
		)`).Scan(&exists); err != nil {
		return err
	}
	if !exists {
		return nil
	}
	version, err := goose.GetDBVersion(db)
	if err != nil {
		return err
	}
	if version >= 1 {
		return nil
	}
	_, err = db.Exec(`INSERT INTO goose_db_version (version_id, is_applied) VALUES (1, TRUE)`)
	return err
}
