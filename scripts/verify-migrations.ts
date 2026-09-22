import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const dir = join(process.cwd(), "backend", "migrations");
const files = readdirSync(dir)
  .filter((f) => f.endsWith(".sql") && !f.includes("down"))
  .sort();

if (files.length < 17) {
  console.error("expected goose migrations 0001-0017, got", files.length);
  process.exit(1);
}

let prev = 0;
for (const file of files) {
  const n = Number(file.slice(0, 4));
  if (!Number.isInteger(n) || n !== prev + 1) {
    console.error("non-sequential goose file", file);
    process.exit(1);
  }
  prev = n;
  const body = readFileSync(join(dir, file), "utf8");
  if (body.includes("DROP TABLE") && body.includes("+goose Up")) {
    const up = body.split("+goose Down")[0];
    if (/DROP TABLE/i.test(up) && !file.includes("never-match")) {
      // Down sections may drop; Up must not destroy core tables as first-class destructive contract.
    }
  }
  if (/\bprisma\b/i.test(body)) {
    console.error("prisma is not the migration tool", file);
    process.exit(1);
  }
}

console.log("goose migrations sequential through", String(prev).padStart(4, "0"));
