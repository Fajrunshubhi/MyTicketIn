import { describe, expect, it } from "vitest";
import { displayPhoneId, parsePhoneId } from "./phone-id";

describe("parsePhoneId", () => {
  it("accepts local and international Indonesian mobiles", () => {
    expect(parsePhoneId("081234567890")).toBe("6281234567890");
    expect(parsePhoneId("+62 812-3456-7890")).toBe("6281234567890");
    expect(parsePhoneId("81234567890")).toBe("6281234567890");
  });
  it("rejects short or foreign numbers", () => {
    expect(parsePhoneId("08123")).toBeNull();
    expect(parsePhoneId("14155552671")).toBeNull();
  });
  it("round-trips display format", () => {
    expect(displayPhoneId("6281234567890")).toBe("081234567890");
  });
});
