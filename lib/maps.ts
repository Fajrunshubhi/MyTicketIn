export function googleMapsSearchUrl(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export function googleMapsCoordUrl(latitude: number, longitude: number): string {
  return googleMapsSearchUrl(`${latitude},${longitude}`);
}

export function googleMapsEmbedUrl(query: string): string {
  return `https://www.google.com/maps?q=${encodeURIComponent(query)}&z=16&hl=id&output=embed`;
}

export function eventMapQuery(input: {
  venueName: string;
  addressLine: string;
  city: string;
  province: string;
  latitude?: number | null;
  longitude?: number | null;
}): string {
  if (input.latitude != null && input.longitude != null) {
    return `${input.latitude},${input.longitude}`;
  }
  return [input.venueName, input.addressLine, input.city, input.province].filter(Boolean).join(", ");
}
