/**
 * Allowlisted payment methods and the instruction payload shown to buyers.
 * Unknown keys (Snap tokens, raw provider bodies) never leave this sanitizer.
 */

export const PAYMENT_METHODS = ["QRIS", "VIRTUAL_ACCOUNT", "EWALLET"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const VA_BANKS = ["BCA", "BNI", "BRI", "MANDIRI", "PERMATA"] as const;
export type VaBank = (typeof VA_BANKS)[number];

export type PaymentInstructions = {
  kind: PaymentMethod;
  copyText: string;
  qrString?: string;
  qrImageUrl?: string;
  bank?: VaBank;
  vaNumber?: string;
  billerCode?: string;
  billKey?: string;
  redirectUrl?: string;
  simulatorHint?: string;
  simulatorUrl?: string;
};

export function parsePaymentMethod(raw: string | undefined | null): PaymentMethod | null {
  const v = String(raw || "").trim().toUpperCase();
  return (PAYMENT_METHODS as readonly string[]).includes(v) ? (v as PaymentMethod) : null;
}

export function parseVaBank(raw: string | undefined | null): VaBank | null {
  const v = String(raw || "").trim().toUpperCase();
  return (VA_BANKS as readonly string[]).includes(v) ? (v as VaBank) : null;
}

export function allowQrImageUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    if (u.hostname !== "api.sandbox.midtrans.com" && u.hostname !== "api.midtrans.com") return false;
    return /^\/v[24]\/qris\/[A-Za-z0-9_-]+\/qr-code\/?$/.test(u.pathname);
  } catch {
    return false;
  }
}

function allowSimulatorUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.hostname === "simulator.sandbox.midtrans.com";
  } catch {
    return false;
  }
}

export function midtransSimulatorUrl(kind: PaymentMethod, bank?: VaBank): string {
  if (kind === "QRIS") return "https://simulator.sandbox.midtrans.com/v2/qris/index";
  if (kind === "EWALLET") return "https://simulator.sandbox.midtrans.com/gopay/index";
  switch (bank) {
    case "BNI":
      return "https://simulator.sandbox.midtrans.com/bni/va/index";
    case "BRI":
      return "https://simulator.sandbox.midtrans.com/openapi/va/index?bank=bri";
    case "PERMATA":
      return "https://simulator.sandbox.midtrans.com/openapi/va/index?bank=permata";
    case "MANDIRI":
      return "https://simulator.sandbox.midtrans.com/openapi/va/index?bank=mandiri";
    default:
      return "https://simulator.sandbox.midtrans.com/bca/va/index";
  }
}

function allowSnapRedirect(url: string): boolean {
  try {
    const u = new URL(url);
    return (
      u.protocol === "https:" &&
      (u.hostname === "app.sandbox.midtrans.com" || u.hostname === "app.midtrans.com") &&
      u.pathname.startsWith("/snap/")
    );
  } catch {
    return false;
  }
}

function clip(v: unknown, max: number): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  if (!s || s.length > max) return undefined;
  return s;
}

export function sanitizePaymentInstructions(raw: unknown): PaymentInstructions | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const kindRaw = typeof o.kind === "string" ? o.kind : "";
  const redirectUrl = clip(o.redirectUrl, 500);

  if (kindRaw === "QRIS" || (!kindRaw && (o.qrString || o.qrImageUrl))) {
    const qrImage = clip(o.qrImageUrl, 500);
    const qrString = clip(o.qrString, 512);
    const qrImageUrl = qrImage && allowQrImageUrl(qrImage) ? qrImage : undefined;
    const copyText = clip(o.copyText, 500) || qrImageUrl || qrString || "";
    if (!qrImageUrl && !qrString && !copyText) return null;
    return {
      kind: "QRIS",
      qrImageUrl,
      qrString,
      copyText,
      simulatorHint: clip(o.simulatorHint, 300),
      simulatorUrl: allowSimulatorUrl(clip(o.simulatorUrl, 200) || "") ? clip(o.simulatorUrl, 200) : undefined,
    };
  }

  if (kindRaw === "VIRTUAL_ACCOUNT" || (!kindRaw && (o.vaNumber || o.billKey))) {
    const bank = parseVaBank(String(o.bank || ""));
    const vaNumber = clip(o.vaNumber, 32);
    const billerCode = clip(o.billerCode, 16);
    const billKey = clip(o.billKey, 32);
    const copyText = clip(o.copyText, 64) || vaNumber || billKey || "";
    if (!copyText) return null;
    return {
      kind: "VIRTUAL_ACCOUNT",
      bank: bank || undefined,
      vaNumber,
      billerCode,
      billKey,
      copyText,
      simulatorHint: clip(o.simulatorHint, 300),
      simulatorUrl: allowSimulatorUrl(clip(o.simulatorUrl, 200) || "") ? clip(o.simulatorUrl, 200) : undefined,
    };
  }

  if (kindRaw === "EWALLET" || (redirectUrl && allowSnapRedirect(redirectUrl))) {
    if (!redirectUrl || !allowSnapRedirect(redirectUrl)) return null;
    return {
      kind: "EWALLET",
      redirectUrl,
      copyText: clip(o.copyText, 128) || "",
      simulatorHint: clip(o.simulatorHint, 300),
      simulatorUrl: allowSimulatorUrl(clip(o.simulatorUrl, 200) || "") ? clip(o.simulatorUrl, 200) : undefined,
    };
  }
  return null;
}

/** Deterministic sandbox VA so refresh never mints a new number for the same payment. */
export function sandboxVaNumber(bank: VaBank, paymentId: string): string {
  const hex = paymentId.replace(/[^0-9a-f]/gi, "").toLowerCase().padEnd(16, "8");
  const digits = [...hex].map((c) => String(parseInt(c, 16) % 10)).join("");
  switch (bank) {
    case "BCA":
      return `70012${digits.slice(0, 11)}`;
    case "BNI":
      return `9880${digits.slice(0, 12)}`;
    case "BRI":
      return `12608${digits.slice(0, 11)}`;
    case "PERMATA":
      return `821${digits.slice(0, 13)}`;
    case "MANDIRI":
      return digits.slice(0, 12);
  }
}

export function sandboxQrisInstructions(ref: string, amountRupiah: number): PaymentInstructions {
  const qrString = `MTI-SANDBOX|QRIS|${ref}|${amountRupiah}`;
  return {
    kind: "QRIS",
    qrString,
    copyText: qrString,
    simulatorHint: "Ini QR uji. Gunakan tombol Simulasikan lunas. Bukan uang nyata.",
  };
}

export function sandboxVaInstructions(bank: VaBank, paymentId: string, amountRupiah: number): PaymentInstructions {
  const vaNumber = sandboxVaNumber(bank, paymentId);
  if (bank === "MANDIRI") {
    return {
      kind: "VIRTUAL_ACCOUNT",
      bank,
      billerCode: "70012",
      billKey: vaNumber,
      copyText: vaNumber,
      simulatorHint: `Bayar tepat jumlah tagihan lewat Mandiri (kode perusahaan 70012). Sandbox, bukan transfer uang nyata.`,
    };
  }
  return {
    kind: "VIRTUAL_ACCOUNT",
    bank,
    vaNumber,
    copyText: vaNumber,
    simulatorHint: `Transfer tepat jumlah tagihan ke VA ${bank}. Sandbox, bukan transfer uang nyata.`,
  };
}

export function sandboxEwalletInstructions(ref: string): PaymentInstructions {
  return {
    kind: "EWALLET",
    copyText: ref,
    simulatorHint: "E-wallet uji. Gunakan tombol Simulasikan lunas. Bukan uang nyata.",
  };
}
