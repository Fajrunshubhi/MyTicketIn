export const BUYER_CANCEL_REFUND_PERCENT = 75;

export const TRANSFER_HOLD_HOURS = 24;

export const REFUND_BANKS = [
  "BCA",
  "Mandiri",
  "BNI",
  "BRI",
  "BSI",
  "CIMB Niaga",
  "Permata",
  "Danamon",
  "BTN",
  "SeaBank",
  "Bank Jago",
  "DANA",
  "GoPay",
  "OVO",
] as const;

export type RefundBankInput = {
  bankName?: string;
  accountName?: string;
  accountNumber?: string;
};

export type ParsedRefundBank = { bankName: string; accountName: string; accountNumber: string };

export function parseRefundBank(input: RefundBankInput): ParsedRefundBank | { error: string; field: string } {
  const bankName = String(input.bankName || "").trim();
  const accountName = String(input.accountName || "")
    .trim()
    .replace(/\s+/g, " ");
  const accountNumber = String(input.accountNumber || "").replace(/\D/g, "");
  if (!(REFUND_BANKS as readonly string[]).includes(bankName)) {
    return { error: "Pilih bank atau e-wallet dari daftar.", field: "bankName" };
  }
  if (accountName.length < 3 || accountName.length > 80 || !/^[A-Za-z .,'-]+$/.test(accountName)) {
    return { error: "Nama rekening 3–80 huruf.", field: "accountName" };
  }
  if (accountNumber.length < 8 || accountNumber.length > 20) {
    return { error: "Nomor rekening 8–20 digit.", field: "accountNumber" };
  }
  return { bankName, accountName, accountNumber };
}

export function isParsedRefundBank(value: ParsedRefundBank | { error: string; field: string }): value is ParsedRefundBank {
  return "bankName" in value && "accountNumber" in value && !("error" in value);
}

export function maskAccountNumber(value: string): string {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length < 4) return "****";
  return `${"*".repeat(Math.max(4, digits.length - 4))}${digits.slice(-4)}`;
}

export function remainingRefundable(paymentAmount: number, outstanding: number): number {
  if (!Number.isInteger(paymentAmount) || !Number.isInteger(outstanding) || paymentAmount < 0 || outstanding < 0) {
    return 0;
  }
  return Math.max(0, paymentAmount - outstanding);
}

/** Pembatalan oleh pembeli: 75% sisa captured, aritmetika integer. Penyelenggara/event batal memakai 100%. */
export function buyerCancelRefundAmount(remainingRupiah: number): number {
  if (!Number.isInteger(remainingRupiah) || remainingRupiah <= 0) return 0;
  return Math.floor((remainingRupiah * BUYER_CANCEL_REFUND_PERCENT) / 100);
}

/** Setelah refund ini Completed, hitung delta EARN_REVERSAL (poin, integer). */
export function earnReversalDelta(input: {
  earnedPoints: number;
  alreadyReversed: number;
  totalPayableRupiah: number;
  cumulativeCompletedRupiah: number;
}): number {
  const remainingPay = Math.max(0, input.totalPayableRupiah - input.cumulativeCompletedRupiah);
  const targetReversed = Math.min(input.earnedPoints, Math.max(0, input.earnedPoints - Math.floor(remainingPay / 1000)));
  return Math.max(0, targetReversed - input.alreadyReversed);
}

export function isFullRefund(cumulativeCompletedRupiah: number, totalPayableRupiah: number): boolean {
  return cumulativeCompletedRupiah >= totalPayableRupiah && totalPayableRupiah > 0;
}
