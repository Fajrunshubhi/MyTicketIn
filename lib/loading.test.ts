import { describe, expect, it } from "vitest";
import { shouldTrackLoading } from "@/lib/loading";

describe("shouldTrackLoading", () => {
  it("does not overlay GET/HEAD background reads", () => {
    expect(shouldTrackLoading("/api/orders", "GET")).toBe(false);
    expect(shouldTrackLoading("/api/orders/abc/payment", "GET")).toBe(false);
    expect(shouldTrackLoading("/api/me", "GET")).toBe(false);
    expect(shouldTrackLoading("/login", "GET")).toBe(false);
    expect(shouldTrackLoading("/api/auth/csrf", "HEAD")).toBe(false);
  });

  it("tracks mutating API calls", () => {
    expect(shouldTrackLoading("/api/orders", "POST")).toBe(true);
    expect(shouldTrackLoading("/api/orders/abc/payment", "POST")).toBe(true);
  });

  it("ignores static Next assets", () => {
    expect(shouldTrackLoading("/_next/static/chunk.js", "GET")).toBe(false);
    expect(shouldTrackLoading("/dummy-events/jazz-1.jpg", "GET")).toBe(false);
  });
});
