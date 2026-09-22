export type InventoryMode = "GENERAL_ADMISSION" | "ZONED" | "RESERVED_SEATING";
export type EventStatus = "DRAFT" | "PENDING_REVIEW" | "PUBLISHED" | "REJECTED" | "CANCELLED" | "COMPLETED";

export type EventSummary = {
  id: string;
  title: string;
  status: EventStatus;
  updatedAt: string;
  version: number;
  inventoryMode: InventoryMode;
};

export type EventRecord = {
  id: string;
  slug: string;
  title: string;
  description: string;
  category: string;
  venueName: string;
  addressLine: string;
  city: string;
  province: string;
  latitude?: number | null;
  longitude?: number | null;
  tags?: string[];
  galleryUrls?: string[];
  timezone: string;
  startsAt: string;
  endsAt: string;
  terms: string;
  contactEmail: string;
  contactPhone?: string | null;
  status: EventStatus;
  inventoryMode: InventoryMode;
  version: number;
  submittedAt?: string | null;
  moderationReason?: string | null;
  publishedAt?: string | null;
  cancelledAt?: string | null;
  completedAt?: string | null;
};

export type TicketTypeRecord = {
  id: string;
  name: string;
  description?: string | null;
  priceRupiah: number;
  quota: number;
  remaining?: number;
  paidQuantity?: number;
  reservedQuantity?: number;
  maxPerAccount: number;
  saleStartsAt: string;
  saleEndsAt: string;
  sortOrder: number;
  version: number;
  salesStoppedAt?: string | null;
};

export type SectionRecord = {
  id: string;
  eventId: string;
  ticketTypeId: string;
  name: string;
  sortOrder: number;
};

export type SeatRecord = {
  id: string;
  eventId: string;
  sectionId: string;
  label: string;
};

export type SeatMapRecord = {
  id: string;
  altText: string;
  legend: string;
  status: string;
};

export const TIMEZONES = ["Asia/Jakarta", "Asia/Makassar", "Asia/Jayapura"] as const;

export const MODE_LABEL: Record<InventoryMode, string> = {
  GENERAL_ADMISSION: "Masuk umum",
  ZONED: "Zona",
  RESERVED_SEATING: "Kursi bernomor",
};

export const STATUS_LABEL: Record<EventStatus, string> = {
  DRAFT: "Draf",
  PENDING_REVIEW: "Menunggu moderasi",
  PUBLISHED: "Terbit",
  REJECTED: "Ditolak",
  CANCELLED: "Dibatalkan",
  COMPLETED: "Selesai",
};
