import { describe, expect, it } from "vitest";
import { dateFilterChipLabel, inferDateFilterMode, readDateFilterFromForm, resolveDateFilter } from "./date-filter";

describe("date filter helpers", () => {
  it("treats equal from/to as a single-day filter", () => {
    expect(inferDateFilterMode("2026-10-18", "2026-10-18")).toBe("on");
    expect(inferDateFilterMode("", "")).toBe("on");
    expect(inferDateFilterMode("2026-10-18", "2026-10-20")).toBe("range");
    expect(inferDateFilterMode("2026-10-18", "")).toBe("range");
    expect(inferDateFilterMode("", "2026-10-20")).toBe("range");
  });

  it("copies one date into from and to", () => {
    expect(resolveDateFilter("on", { dateOn: "2026-11-07" })).toEqual({
      dateFrom: "2026-11-07",
      dateTo: "2026-11-07",
    });
    expect(resolveDateFilter("range", { dateFrom: "2026-11-01", dateTo: "2026-11-07" })).toEqual({
      dateFrom: "2026-11-01",
      dateTo: "2026-11-07",
    });
  });

  it("labels a single day differently from a range", () => {
    expect(dateFilterChipLabel("2026-10-18", "2026-10-18")).toBe("Tanggal: 18 Okt 2026");
    expect(dateFilterChipLabel("2026-10-18", "2026-10-20")).toBe("18 Okt 2026–20 Okt 2026");
    expect(dateFilterChipLabel("2026-10-18", "")).toBe("Mulai 18 Okt 2026");
  });

  it("keeps from/to when the date-mode control is not in the form", () => {
    const closed = new FormData();
    closed.set("dateFrom", "2026-10-18");
    closed.set("dateTo", "2026-10-20");
    expect(readDateFilterFromForm(closed)).toEqual({ dateFrom: "2026-10-18", dateTo: "2026-10-20" });

    const single = new FormData();
    single.set("dateMode", "on");
    single.set("dateOn", "2026-11-07");
    expect(readDateFilterFromForm(single)).toEqual({ dateFrom: "2026-11-07", dateTo: "2026-11-07" });
  });
});
