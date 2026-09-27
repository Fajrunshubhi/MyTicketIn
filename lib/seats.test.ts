import { describe, expect, it } from "vitest";
import { generateSeatLabels, reservedSeatsFromTypes, seatPrefix, seatPreview } from "./seats";

describe("reserved seat labels", () => {
  it("maps ticket type order to A, B, then AA", () => {
    expect(seatPrefix(0)).toBe("A");
    expect(seatPrefix(1)).toBe("B");
    expect(seatPrefix(25)).toBe("Z");
    expect(seatPrefix(26)).toBe("AA");
  });

  it("builds sequential labels from quota", () => {
    expect(generateSeatLabels("A", 3)).toEqual(["A1", "A2", "A3"]);
    expect(generateSeatLabels("B", 50)).toHaveLength(50);
    expect(generateSeatLabels("B", 50)[49]).toBe("B50");
  });

  it("assigns one letter per ticket type using that type quota", () => {
    const seats = reservedSeatsFromTypes(
      [
        { id: "reg", quota: 2 },
        { id: "vip", quota: 3 },
      ],
      [
        { id: "zona-reg", ticketTypeId: "reg" },
        { id: "zona-vip", ticketTypeId: "vip" },
      ],
    );
    expect(seats.map((s) => s.label)).toEqual(["A1", "A2", "B1", "B2", "B3"]);
    expect(seats.filter((s) => s.sectionId === "zona-vip").map((s) => s.label)).toEqual(["B1", "B2", "B3"]);
  });

  it("does not duplicate labels when two zones share a ticket type", () => {
    const seats = reservedSeatsFromTypes(
      [{ id: "reg", quota: 2 }],
      [
        { id: "z1", ticketTypeId: "reg" },
        { id: "z2", ticketTypeId: "reg" },
      ],
    );
    expect(seats).toEqual([
      { sectionId: "z1", label: "A1" },
      { sectionId: "z1", label: "A2" },
    ]);
  });

  it("summarizes long seat lists", () => {
    expect(seatPreview(["A1", "A2", "A3"], 8)).toBe("A1, A2, A3");
    expect(seatPreview(["A1", "A2", "A3", "A4"], 3)).toBe("A1, A2, A3 … A4");
  });
});
