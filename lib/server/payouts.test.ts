import { afterEach, describe, expect, it } from "vitest";
import { blockMessage, payoutBlockReason, payoutHoldHours } from "@/lib/server/payouts";

const ok = {
  eventStatus: "PUBLISHED",
  pastEnd: true,
  pastHold: true,
  netRupiah: 100_000,
  openRefunds: 0,
  hasBank: true,
  payoutStatus: null,
};

const saved = process.env.PAYOUT_HOLD_HOURS;
afterEach(() => {
  if (saved === undefined) delete process.env.PAYOUT_HOLD_HOURS;
  else process.env.PAYOUT_HOLD_HOURS = saved;
});

describe("payoutBlockReason", () => {
  it("allows a finished, settled event with a bank account", () => {
    expect(payoutBlockReason(ok)).toBeNull();
  });
  it.each([
    [{ pastEnd: false, pastHold: false }, "NOT_ENDED"],
    [{ pastHold: false }, "HOLD"],
    [{ openRefunds: 1 }, "OPEN_REFUND"],
    [{ hasBank: false }, "NO_BANK"],
    [{ netRupiah: 0 }, "NOTHING_TO_PAY"],
    [{ eventStatus: "CANCELLED" }, "NOT_PUBLISHED"],
    [{ payoutStatus: "REQUESTED" }, "ALREADY_REQUESTED"],
    [{ payoutStatus: "PAID" }, "ALREADY_PAID"],
  ])("blocks %j as %s", (patch, expected) => {
    expect(payoutBlockReason({ ...ok, ...patch })).toBe(expected);
    expect(blockMessage(expected as never)).not.toBe("");
  });
});

describe("payoutHoldHours", () => {
  it("defaults to 24 and accepts valid integers including 0", () => {
    delete process.env.PAYOUT_HOLD_HOURS;
    expect(payoutHoldHours()).toBe(24);
    process.env.PAYOUT_HOLD_HOURS = "0";
    expect(payoutHoldHours()).toBe(0);
    process.env.PAYOUT_HOLD_HOURS = "72";
    expect(payoutHoldHours()).toBe(72);
  });
  it("falls back to the default on junk values", () => {
    process.env.PAYOUT_HOLD_HOURS = "-5";
    expect(payoutHoldHours()).toBe(24);
    process.env.PAYOUT_HOLD_HOURS = "abc";
    expect(payoutHoldHours()).toBe(24);
  });
});
