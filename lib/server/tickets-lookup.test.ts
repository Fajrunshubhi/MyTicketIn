import { describe, expect, it } from "vitest";
import { normalizeManualCode } from "@/lib/server/tickets";

describe("normalizeManualCode", () => {
  it("strips separators used on ticket cards", () => {
    expect(normalizeManualCode("A594-3CAC-A9C7-78F1")).toBe("A5943CACA9C778F1");
    expect(normalizeManualCode("a5943caca9c778f1")).toBe("A5943CACA9C778F1");
  });
});
