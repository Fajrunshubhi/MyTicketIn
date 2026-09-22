import { execSync } from "node:child_process";

try {
  const out = execSync(
    'git grep -I -n -E "MIDTRANS_SERVER_KEY=.+|XENDIT_SECRET_KEY=.+|sk_live|BEGIN PRIVATE KEY" -- . ":(exclude).env.example" ":(exclude)RFC" ":(exclude)docs"',
    { encoding: "utf8" },
  );
  if (out.trim()) {
    console.error("secret scan hits:\n", out);
    process.exit(1);
  }
} catch (err) {
  const status = (err as { status?: number }).status;
  if (status !== 1) {
    console.error("secret scan failed");
    process.exit(1);
  }
}
console.log("secret scan ok");
