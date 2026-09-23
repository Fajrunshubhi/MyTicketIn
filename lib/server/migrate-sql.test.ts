import { extractGooseUp, splitGooseStatements } from "@/lib/server/migrate-sql";
import { describe, expect, it } from "vitest";

describe("splitGooseStatements", () => {
  it("keeps StatementBegin blocks as one statement", () => {
    const sql = `-- +goose Up
-- +goose StatementBegin
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('USER', 'ADMIN');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
-- +goose StatementEnd
ALTER TABLE users ADD COLUMN IF NOT EXISTS status TEXT;
`;
    const stmts = splitGooseStatements(extractGooseUp(sql));
    expect(stmts).toHaveLength(2);
    expect(stmts[0]).toContain("CREATE TYPE user_role");
    expect(stmts[1]).toContain("ALTER TABLE users");
  });

  it("stops before Down section", () => {
    const sql = `-- +goose Up
CREATE TABLE a (id TEXT);
-- +goose Down
DROP TABLE a;
`;
    const stmts = splitGooseStatements(extractGooseUp(sql));
    expect(stmts.join(" ")).not.toContain("DROP TABLE");
  });
});
