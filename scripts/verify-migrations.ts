import { listMigrationFiles, migrationsDir } from "../lib/server/migrate-sql";

const dir = migrationsDir();
const files = listMigrationFiles(dir);
if (files.length < 21) {
  console.error("expected goose migrations 0001-0021, got", files.length);
  process.exit(1);
}
console.log("goose migrations sequential through", String(files[files.length - 1]?.version).padStart(4, "0"));
