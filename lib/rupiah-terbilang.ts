const SATUAN = ["", "satu", "dua", "tiga", "empat", "lima", "enam", "tujuh", "delapan", "sembilan"];

function threeDigits(n: number): string {
  const ratus = Math.floor(n / 100);
  const sisa = n % 100;
  const parts: string[] = [];
  if (ratus === 1) parts.push("seratus");
  else if (ratus > 1) parts.push(`${SATUAN[ratus]} ratus`);
  if (sisa === 0) return parts.join(" ");
  if (sisa < 10) parts.push(SATUAN[sisa]);
  else if (sisa === 10) parts.push("sepuluh");
  else if (sisa === 11) parts.push("sebelas");
  else if (sisa < 20) parts.push(`${SATUAN[sisa - 10]} belas`);
  else {
    parts.push(`${SATUAN[Math.floor(sisa / 10)]} puluh`);
    if (sisa % 10) parts.push(SATUAN[sisa % 10]);
  }
  return parts.join(" ");
}

function say(amount: number): string {
  if (amount === 0) return "nol";
  const chunks: { value: number; one: string; many: string }[] = [
    { value: 1_000_000_000_000, one: "satu triliun", many: "triliun" },
    { value: 1_000_000_000, one: "satu miliar", many: "miliar" },
    { value: 1_000_000, one: "satu juta", many: "juta" },
    { value: 1_000, one: "seribu", many: "ribu" },
  ];
  const parts: string[] = [];
  let rest = amount;
  for (const scale of chunks) {
    if (rest < scale.value) continue;
    const count = Math.floor(rest / scale.value);
    rest %= scale.value;
    if (count === 1) parts.push(scale.one);
    else parts.push(`${threeDigits(count)} ${scale.many}`);
  }
  if (rest > 0) parts.push(threeDigits(rest));
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

/** Nominal integer Rupiah dalam kata, untuk kolom terbilang kuitansi. */
export function terbilangRupiah(amount: number): string {
  if (!Number.isInteger(amount) || amount < 0 || amount > 999_999_999_999) {
    throw new Error("Nominal terbilang harus integer 0–999.999.999.999.");
  }
  const words = say(amount);
  return `${words.charAt(0).toUpperCase()}${words.slice(1)} rupiah`;
}

export const STAMP_DUTY_THRESHOLD_RUPIAH = 5_000_000;
