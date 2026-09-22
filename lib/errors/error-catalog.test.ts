import { describe, expect, it } from "vitest";
import { lookupError } from "@/lib/errors/error-catalog";
import { mapApiError, isNetworkFailure } from "@/lib/errors/error-mapper";

describe("error catalog", () => {
  it("maps rate limit recovery", () => {
    const mapped = mapApiError(
      { error: { code: "RATE_LIMITED", message: "Terlalu banyak permintaan.", correlationId: "req_x" } },
      "gagal",
    );
    expect(mapped.category).toBe("RATE_LIMIT");
    expect(mapped.recovery).toMatch(/Tunggu/i);
  });

  it("does not treat network as business invalid", () => {
    expect(lookupError("NETWORK_CLIENT").category).toBe("NETWORK_CLIENT");
    expect(lookupError("NETWORK_CLIENT").message).not.toMatch(/tiket invalid/i);
  });

  it("detects fetch TypeError as network", () => {
    expect(isNetworkFailure(new TypeError("Failed to fetch"))).toBe(true);
  });
});
