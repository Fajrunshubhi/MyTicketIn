import { describe, expect, it } from "vitest";
import { buyerCancelRefundAmount, earnReversalDelta, isFullRefund, remainingRefundable, maskAccountNumber, parseRefundBank } from "./refund-policy";

describe("refund policy", () => {
  it("caps outstanding refunds at captured amount", () => {
    expect(remainingRefundable(50000, 0)).toBe(50000);
    expect(remainingRefundable(50000, 20000)).toBe(30000);
    expect(remainingRefundable(50000, 50000)).toBe(0);
    expect(remainingRefundable(50000, 60000)).toBe(0);
  });

  it("reverses earned points in proportion to remaining net paid", () => {
    expect(
      earnReversalDelta({
        earnedPoints: 50,
        alreadyReversed: 0,
        totalPayableRupiah: 50000,
        cumulativeCompletedRupiah: 50000,
      }),
    ).toBe(50);
    expect(
      earnReversalDelta({
        earnedPoints: 50,
        alreadyReversed: 20,
        totalPayableRupiah: 50000,
        cumulativeCompletedRupiah: 25000,
      }),
    ).toBe(5);
  });

  it("treats cumulative at least payable as full refund", () => {
    expect(isFullRefund(100, 100)).toBe(true);
    expect(isFullRefund(99, 100)).toBe(false);
  });

  it("refunds 75 percent on buyer cancel using integer math", () => {
    expect(buyerCancelRefundAmount(10000)).toBe(7500);
    expect(buyerCancelRefundAmount(1)).toBe(0);
    expect(buyerCancelRefundAmount(133)).toBe(99);
  });

  it("accepts allowlisted bank details and rejects short account numbers", () => {
    expect(parseRefundBank({ bankName: "BCA", accountName: "Budi Cahyadi", accountNumber: "1234567890" })).toEqual({
      bankName: "BCA",
      accountName: "Budi Cahyadi",
      accountNumber: "1234567890",
    });
    expect(parseRefundBank({ bankName: "BCA", accountName: "Budi", accountNumber: "123" })).toMatchObject({
      field: "accountNumber",
    });
    expect(maskAccountNumber("1234567890")).toBe("******7890");
  });
});
