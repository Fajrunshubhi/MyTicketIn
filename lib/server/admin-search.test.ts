import { describe, expect, it } from "vitest";
import { likePattern, parseAdminSearch } from "@/lib/server/admin-search";

describe("admin search input", () => {
  it("escapes LIKE wildcards", () => {
    expect(likePattern("50%_a\\")).toBe("%50\\%\\_a\\\\%");
  });
  it("rejects short queries", () => {
    expect(() => parseAdminSearch(new URLSearchParams("q=a"))).toThrow();
  });
  it("falls back to all for unknown type and clamps page", () => {
    const r = parseAdminSearch(new URLSearchParams("q=joko&type=x&page=-3"));
    expect(r).toEqual({ q: "joko", type: "all", page: 1 });
  });
  it("accepts a valid type and page", () => {
    expect(parseAdminSearch(new URLSearchParams("q=ab&type=orders&page=2"))).toEqual({ q: "ab", type: "orders", page: 2 });
  });
});
