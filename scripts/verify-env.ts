const required = ["APP_ENV", "API_ADDR", "WEB_ORIGIN", "SESSION_SECRET", "DATABASE_URL", "DATABASE_URL_UNPOOLED"];
const missing = required.filter((k) => !String(process.env[k] || "").trim());
if (missing.length && process.env.ALLOW_PARTIAL_ENV !== "true") {
  console.error("missing", missing.join(","));
  process.exit(1);
}
if (process.env.MIDTRANS_SERVER_KEY || process.env.XENDIT_SECRET_KEY) {
  console.error("PRODUCTION_PAYMENT_CREDENTIAL");
  process.exit(1);
}
const email = (process.env.EMAIL_PROVIDER || "sandbox").trim();
if (email !== "sandbox") {
  console.error("EMAIL_PROVIDER must be sandbox until provider gate");
  process.exit(1);
}
console.log("env gate ok (sandbox)");
