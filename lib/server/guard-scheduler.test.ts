import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { requireScheduler } from "@/lib/server/guard";

const req = (secret?: string) =>
  new NextRequest("http://localhost/api/internal/jobs/x", {
    method: "POST",
    headers: secret === undefined ? {} : { "x-scheduler-secret": secret },
  });

const original = {
  s: process.env.SCHEDULER_SECRET,
  sess: process.env.SESSION_SECRET,
};
afterEach(() => {
  process.env.SCHEDULER_SECRET = original.s;
  process.env.SESSION_SECRET = original.sess;
});

describe("requireScheduler", () => {
  it("accepts only the dedicated scheduler secret", () => {
    process.env.SCHEDULER_SECRET = "scheduler-secret-0123456789abcdef";
    expect(() =>
      requireScheduler(req("scheduler-secret-0123456789abcdef")),
    ).not.toThrow();
    expect(() =>
      requireScheduler(req("scheduler-secret-0123456789abcdeX")),
    ).toThrow();
    expect(() => requireScheduler(req("short"))).toThrow();
    expect(() => requireScheduler(req())).toThrow();
  });

  it("stays closed when SCHEDULER_SECRET is missing, even if SESSION_SECRET matches", () => {
    delete process.env.SCHEDULER_SECRET;
    process.env.SESSION_SECRET = "session-secret-0123456789abcdef";
    expect(() =>
      requireScheduler(req("session-secret-0123456789abcdef")),
    ).toThrow();
    expect(() => requireScheduler(req(""))).toThrow();
  });
});
