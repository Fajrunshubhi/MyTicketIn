export const SALE_LABEL: Record<string, string> = {
  AVAILABLE: "Tersedia",
  NOT_STARTED: "Belum mulai",
  ENDED: "Penjualan berakhir",
  STOPPED: "Dihentikan",
  PAST: "Selesai",
};

export type CatalogCard = {
  slug: string;
  title: string;
  category: string;
  city: string;
  startsAt: string;
  timezone: string;
  image: { url: string; alt: string };
  priceFromRupiah: number | null;
  saleStatus: string;
  ratingAverage: number;
  ratingCount: number;
};

export type PublicEvent = {
  id: string;
  slug: string;
  title: string;
  description: string;
  category: string;
  organizer: { id?: string; name?: string };
  venueName: string;
  addressLine: string;
  city: string;
  province: string;
  latitude?: number | null;
  longitude?: number | null;
  tags?: string[];
  timezone: string;
  startsAt: string;
  endsAt: string;
  terms: string;
  contactEmail: string;
  contactPhone?: string | null;
  inventoryMode: string;
  image: { url: string; alt: string };
  images?: { url: string; alt: string }[];
  seatMap?: { url: string; altText: string; legend: string } | null;
  sections: { id: string; name: string; ticketTypeId: string }[];
  seats: { id: string; sectionId: string; label: string; saleStatus: string }[];
  ticketTypes: {
    id: string;
    name: string;
    description?: string;
    priceRupiah: number;
    quota: number;
    saleStartsAt: string;
    saleEndsAt: string;
    maxPerAccount: number;
    saleStatus: string;
    remaining: number;
    stockLabel: string;
  }[];
  availabilityDisclaimer: string;
  ratingAverage: number;
  ratingCount: number;
};
