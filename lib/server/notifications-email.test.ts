import { beforeEach, describe, expect, it, vi } from "vitest";

type Call = { sql: string; params: unknown[] };
const calls: Call[] = [];
let attemptCount = 1;
let sendResult: "sent" | "skipped" | "throw" = "sent";

vi.mock("@/lib/server/http", async () => {
  const actual = await vi.importActual<typeof import("@/lib/server/http")>("@/lib/server/http");
  const run = async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    const s = sql.replace(/\s+/g, " ");
    if (s.includes("UPDATE notification_deliveries SET status='PROCESSING'")) return attemptCount > 0 ? [{ attempt_count: attemptCount }] : [];
    if (s.includes("FROM notifications n JOIN users u")) {
      return [{ title: "Tiket terbit", body: "Tiket Anda siap.", action_path: "/dashboard/ticket", type: "TICKET_ISSUED", entity_id: "ord1", entity_type: "Order", recipient_user_id: "u1", name: "Budi", email: "budi@example.com" }];
    }
    return [];
  };
  return { ...actual, query: vi.fn(run), execute: vi.fn(async (sql: string, params: unknown[] = []) => (await run(sql, params), 1)) };
});
vi.mock("@/lib/server/mail", async () => {
  const actual = await vi.importActual<typeof import("@/lib/server/mail")>("@/lib/server/mail");
  return {
    ...actual,
    sendMail: vi.fn(async () => {
      if (sendResult === "throw") throw new Error("RESEND_FAILED");
      return sendResult;
    }),
  };
});

vi.mock("@/lib/server/email-attachments", () => ({
  receiptAttachments: vi.fn(async () => [{ filename: "bukti.pdf", content: Buffer.from("r"), contentType: "application/pdf" }]),
  ticketAttachments: vi.fn(async () => [{ filename: "tiket.pdf", content: Buffer.from("t"), contentType: "application/pdf" }]),
}));
import { sendMail } from "@/lib/server/mail";
import { deliverEmail } from "@/lib/server/notifications";

const last = (needle: string) => calls.filter((c) => c.sql.includes(needle)).at(-1);

describe("F50 deliverEmail", () => {
  beforeEach(() => {
    calls.length = 0;
    attemptCount = 1;
    sendResult = "sent";
  });

  it("marks SENT on success", async () => {
    expect(await deliverEmail("n1")).toBe("sent");
    expect(last("status='SENT'")).toBeTruthy();
  });

  it("marks SKIPPED when no provider is configured", async () => {
    sendResult = "skipped";
    expect(await deliverEmail("n1")).toBe("skipped");
    expect(last("status='SKIPPED'")).toBeTruthy();
  });

  it("records FAILED with a retry delay and never throws", async () => {
    sendResult = "throw";
    attemptCount = 1;
    expect(await deliverEmail("n1")).toBe("failed");
    expect(last("status='FAILED'")?.params[1]).toBe(5);
  });

  it("stops retrying after the last attempt", async () => {
    sendResult = "throw";
    attemptCount = 3;
    expect(await deliverEmail("n1")).toBe("failed");
    expect(last("status='FAILED'")?.params[1]).toBeNull();
  });

  it("does nothing when the delivery was already claimed or exhausted", async () => {
    attemptCount = 0;
    expect(await deliverEmail("n1")).toBe("gone");
    expect(calls.some((c) => c.sql.includes("status='SENT'"))).toBe(false);
  });
});

describe("F50 PDF attachments", () => {
  beforeEach(() => {
    calls.length = 0;
    attemptCount = 1;
    sendResult = "sent";
    vi.mocked(sendMail).mockClear();
  });

  it("attaches the e-ticket PDFs to TICKET_ISSUED emails", async () => {
    await deliverEmail("n1");
    const arg = vi.mocked(sendMail).mock.calls[0][0];
    expect(arg.attachments?.map((a) => a.filename)).toEqual(["tiket.pdf"]);
  });
});
