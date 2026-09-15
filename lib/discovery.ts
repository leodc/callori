import type { Purpose } from "./call-plan";
import type { CallingCountry } from "./phone";

export type SavedContact = {
  placeId: string;
  country: CallingCountry;
  createdAt: string;
};
export type Business = {
  placeId: string;
  name: string;
  address: string;
  phone: string;
  location: { lat: number; lng: number };
  mapsUrl: string;
  closed: boolean;
  attributions: { name: string; uri: string }[];
};
export const discoveryCountries = {
  JP: {
    language: "ja",
    region: "jp",
    countryTerm: "日本",
    center: { lat: 35.6812, lng: 139.7671 },
    bounds: { south: 20, north: 46, west: 122, east: 154 },
    terms: {
      dentist: "歯科",
      doctor: "クリニック",
      beauty: "美容院",
      other: "",
      restaurant: "レストラン",
    },
  },
};
export function searchTerm(
  purpose: Purpose,
  category: string,
  country: CallingCountry,
) {
  const terms = discoveryCountries[country].terms;
  return purpose === "restaurant"
    ? terms.restaurant
    : purpose === "appointment"
      ? terms[category as keyof typeof terms] || ""
      : "";
}
export function searchQuery(
  term: string,
  area: string,
  country: CallingCountry,
) {
  return [term.trim(), area.trim(), discoveryCountries[country].countryTerm]
    .filter(Boolean)
    .join(" ");
}
export function insideDestination(
  location: { lat: number; lng: number },
  country: CallingCountry,
) {
  const b = discoveryCountries[country].bounds;
  return (
    Number.isFinite(location.lat) &&
    Number.isFinite(location.lng) &&
    location.lat >= b.south &&
    location.lat <= b.north &&
    location.lng >= b.west &&
    location.lng <= b.east
  );
}
export function mapsSearchUrl(
  term: string,
  area: string,
  country: CallingCountry,
) {
  return `https://www.google.com/maps/search/?${new URLSearchParams({ api: "1", query: searchQuery(term, area, country) })}`;
}
export function placeMapsUrl(placeId: string, name: string) {
  return `https://www.google.com/maps/search/?${new URLSearchParams({ api: "1", query: name, query_place_id: placeId })}`;
}

export function nearbyBounds(point: { lat: number; lng: number }) {
  const latitude = 5 / 111;
  const longitude = latitude / Math.cos((point.lat * Math.PI) / 180);
  return {
    south: point.lat - latitude,
    north: point.lat + latitude,
    west: point.lng - longitude,
    east: point.lng + longitude,
  };
}
