import type { Metadata } from "next";
import { CheckoutClient } from "@/components/checkout/CheckoutClient";

export const metadata: Metadata = {
  title: "Checkout — MyTicketIn",
  description: "Lengkapi biodata pemegang tiket dan konfirmasi order.",
};

export default function EventCheckoutPage({ params }: { params: { slug: string } }) {
  return <CheckoutClient slug={params.slug} />;
}
