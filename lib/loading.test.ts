import { describe, expect, it } from "vitest";
import { shouldTrackLoading } from "@/lib/loading";

describe("shouldTrackLoading", () => {
  it("tracks API and app routes", () => {
    expect(shouldTrackLoading("/api/public/organizers")).toBe(true);
    expect(shouldTrackLoading("/login")).toBe(true);
  });

  it("ignores static Next assets", () => {
    expect(shouldTrackLoading("/_next/static/chunk.js")).toBe(false);
    expect(shouldTrackLoading("/dummy-events/jazz-1.jpg")).toBe(false);
  });
});
