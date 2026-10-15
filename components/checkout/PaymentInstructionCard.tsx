"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { formatRupiah } from "@/lib/format";
import { renderQrDataUrl } from "@/lib/qr-client";
import type { PaymentInstructions } from "@/lib/payment-methods";

type Props = {
  methodLabel: string;
  amountRupiah: number;
  status: string;
  provider: string;
  sandbox: boolean;
  instructions: PaymentInstructions | null;
  redirectUrl?: string | null;
  pending: boolean;
  busy: boolean;
  onCopy: (text: string) => void;
  onRefresh: () => void;
  onSimulate?: () => void;
};

export function PaymentInstructionCard({
  methodLabel,
  amountRupiah,
  status,
  provider,
  sandbox,
  instructions,
  redirectUrl,
  pending,
  busy,
  onCopy,
  onRefresh,
  onSimulate,
}: Props) {
  const [qrSrc, setQrSrc] = useState("");
  const qrString = instructions?.qrString || "";
  const qrImageUrl = instructions?.qrImageUrl || "";

  useEffect(() => {
    let cancelled = false;
    setQrSrc(qrImageUrl);
    if (qrImageUrl || !qrString) return;
    void renderQrDataUrl(qrString).then((url) => {
      if (!cancelled) setQrSrc(url);
    });
    return () => {
      cancelled = true;
    };
  }, [qrImageUrl, qrString]);

  const copyTarget = instructions?.copyText || "";
  const isVa = instructions?.kind === "VIRTUAL_ACCOUNT";
  const isQris = instructions?.kind === "QRIS" || (!instructions && methodLabel === "QRIS");
  const internalSimulator = provider === "sandbox";

  return (
    <section className="rounded-3xl border border-stone-200 bg-white p-5">
      <h2 className="text-lg font-semibold text-ink">Instruksi {methodLabel}</h2>
      <p role="status" aria-live="polite" className="mt-1 text-sm text-ink/65">
        Status {status === "SUCCEEDED" ? "berhasil" : status.toLowerCase()} · {sandbox ? "uji" : "transaksi nyata"}
      </p>
      <p className="mt-2 text-sm font-medium text-ink">Bayar tepat {formatRupiah(amountRupiah)}</p>
      <p className="mt-1 text-sm text-ink/65">
        Tiket hanya terbit setelah konfirmasi pembayaran, bukan dari halaman ini.
      </p>

      {isQris ? (
        <div className="mt-4 flex flex-col items-center gap-3">
          {qrSrc ? (
            // Midtrans/sandbox QR is an already-rendered PNG; next/image is not used because the URL is short-lived.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={qrSrc}
              alt={`Kode QRIS sandbox sebesar ${formatRupiah(amountRupiah)}`}
              width={240}
              height={240}
              className="h-60 w-60 rounded-xl border border-stone-200 bg-white p-2"
            />
          ) : (
            <p className="text-sm text-ink/60">Menyiapkan kode QR…</p>
          )}
          <p className="text-center text-sm text-ink/70">
            {sandbox
              ? "Ini QR uji. Aplikasi bank sungguhan akan menolaknya. Pakai simulator Midtrans."
              : "Pindai dengan aplikasi bank atau e-wallet yang mendukung QRIS."}
          </p>
          {sandbox && copyTarget.startsWith("https://") ? (
            <p className="w-full break-all rounded-xl bg-[#f7f8fd] p-3 text-center font-mono text-xs text-ink/80">
              {copyTarget}
            </p>
          ) : null}
        </div>
      ) : null}

      {isVa ? (
        <div className="mt-4 space-y-2 rounded-xl bg-[#f7f8fd] p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink/45">
            {instructions?.bank || "Virtual account"}
          </p>
          {instructions?.billerCode ? (
            <p className="text-sm text-ink/70">
              Kode perusahaan <span className="font-mono font-semibold text-ink">{instructions.billerCode}</span>
            </p>
          ) : null}
          <p className="break-all font-mono text-lg font-semibold text-ink">
            {instructions?.vaNumber || instructions?.billKey || copyTarget}
          </p>
          <p className="text-sm text-ink/65">
            Transfer dari ATM, m-banking, atau internet banking dengan nominal yang sama persis.
          </p>
        </div>
      ) : null}

      {!isQris && !isVa && copyTarget ? (
        <p className="mt-4 break-all rounded-xl bg-[#f7f8fd] p-4 font-mono text-sm text-ink">{copyTarget}</p>
      ) : null}

      {instructions?.simulatorHint ? <p className="mt-3 text-sm text-ink/60">{instructions.simulatorHint}</p> : null}
      {instructions?.simulatorUrl ? (
        <p className="mt-2 text-sm">
          <a
            href={instructions.simulatorUrl}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-gold-700 underline-offset-2 hover:underline"
          >
            Buka simulator Midtrans Sandbox
          </a>
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        {redirectUrl ? (
          <a
            href={redirectUrl}
            className="inline-flex min-h-11 items-center rounded-full bg-gold-500 px-5 text-sm font-semibold text-white"
          >
            Lanjut di Midtrans
          </a>
        ) : null}
        {copyTarget ? (
          <Button variant="secondary" type="button" onClick={() => onCopy(copyTarget)}>
            Salin {isVa ? "nomor VA" : isQris ? "payload QR" : "instruksi"}
          </Button>
        ) : null}
        <Button variant="secondary" type="button" loading={busy} disabled={busy} onClick={onRefresh}>
          Cek status
        </Button>
        {pending && internalSimulator && onSimulate && (status === "PENDING" || status === "CREATED") ? (
          <Button variant="secondary" type="button" loading={busy} disabled={busy} onClick={onSimulate}>
            Simulasikan lunas
          </Button>
        ) : null}
      </div>
    </section>
  );
}
