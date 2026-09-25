export type ErrorCategory =
  | "VALIDATION"
  | "AUTHENTICATION"
  | "AUTHORIZATION"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMIT"
  | "PROVIDER"
  | "NETWORK_CLIENT"
  | "INTERNAL";

export type CatalogEntry = {
  category: ErrorCategory;
  status: number;
  retryable: boolean;
  message: string;
  recovery: string;
};

export const errorCatalog: Record<string, CatalogEntry> = {
  VALIDATION_ERROR: {
    category: "VALIDATION",
    status: 400,
    retryable: false,
    message: "Data tidak valid.",
    recovery: "Perbaiki isian yang bertanda, lalu kirim ulang.",
  },
  AUTH_REQUIRED: {
    category: "AUTHENTICATION",
    status: 401,
    retryable: false,
    message: "Anda perlu masuk.",
    recovery: "Masuk kembali, lalu ulangi tindakan.",
  },
  FORBIDDEN: {
    category: "AUTHORIZATION",
    status: 403,
    retryable: false,
    message: "Anda tidak memiliki akses.",
    recovery: "Kembali ke beranda atau gunakan akun yang berhak.",
  },
  NOT_FOUND: {
    category: "NOT_FOUND",
    status: 404,
    retryable: false,
    message: "Data tidak ditemukan.",
    recovery: "Periksa tautan atau kembali ke daftar.",
  },
  CONFLICT: {
    category: "CONFLICT",
    status: 409,
    retryable: true,
    message: "Data berubah.",
    recovery: "Muat ulang halaman, lalu coba lagi.",
  },
  RATE_LIMITED: {
    category: "RATE_LIMIT",
    status: 429,
    retryable: true,
    message: "Terlalu banyak permintaan.",
    recovery: "Tunggu sejenak, lalu coba lagi.",
  },
  STORAGE_NOT_CONFIGURED: {
    category: "PROVIDER",
    status: 503,
    retryable: true,
    message: "Penyimpanan gambar belum dikonfigurasi.",
    recovery: "Isi kredensial object storage di Vercel, lalu unggah ulang.",
  },
  SERVICE_UNHEALTHY: {
    category: "PROVIDER",
    status: 503,
    retryable: true,
    message: "Layanan tidak siap.",
    recovery: "Coba lagi. Jangan ulangi pembayaran sebelum status order terbarui.",
  },
  INTERNAL_ERROR: {
    category: "INTERNAL",
    status: 500,
    retryable: true,
    message: "Terjadi kesalahan internal.",
    recovery: "Coba lagi. Sertakan ID korelasi jika menghubungi admin uji.",
  },
  NETWORK_CLIENT: {
    category: "NETWORK_CLIENT",
    status: 0,
    retryable: true,
    message: "Tidak ada koneksi.",
    recovery: "Periksa jaringan, lalu muat ulang. Ini bukan tiket atau pembayaran invalid.",
  },
};

export function lookupError(code?: string): CatalogEntry {
  if (code && errorCatalog[code]) return errorCatalog[code];
  return errorCatalog.INTERNAL_ERROR;
}
