/// <reference types="google.maps" />
import { destinationPhone, type CallingCountry } from "./phone";
import { discoveryCountries, placeMapsUrl, type Business } from "./discovery";

declare global {
  interface Window {
    __calloriMapsReady?: () => void;
    gm_authFailure?: () => void;
  }
}
let loading: Promise<void> | undefined;
export async function loadMaps(key: string) {
  if (
    typeof google !== "undefined" &&
    typeof google.maps?.importLibrary === "function"
  )
    return;
  if (!loading)
    loading = new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      const timer = setTimeout(() => fail(), 20000);
      const fail = () => {
        clearTimeout(timer);
        script.remove();
        loading = undefined;
        delete window.__calloriMapsReady;
        reject(new Error("MAPS_UNAVAILABLE"));
      };
      window.__calloriMapsReady = () => {
        clearTimeout(timer);
        delete window.__calloriMapsReady;
        resolve();
      };
      script.src = `https://maps.googleapis.com/maps/api/js?${new URLSearchParams({ key, v: "quarterly", loading: "async", callback: "__calloriMapsReady", language: "ja", region: "JP", auth_referrer_policy: "origin" })}`;
      script.nonce =
        document.querySelector<HTMLScriptElement>("script[nonce]")?.nonce || "";
      script.async = true;
      script.onerror = fail;
      document.head.append(script);
    });
  return loading;
}
export async function mapsTimeout<T>(task: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([
      task,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("MAPS_TIMEOUT")), 15000);
      }),
    ]);
  } finally {
    clearTimeout(timer!);
  }
}
export const placeFields = [
  "id",
  "displayName",
  "formattedAddress",
  "location",
  "internationalPhoneNumber",
  "nationalPhoneNumber",
  "addressComponents",
  "businessStatus",
  "attributions",
];
export function businessFromPlace(
  place: google.maps.places.Place,
  country: CallingCountry,
): Business | undefined {
  if (
    !place.location ||
    !place.addressComponents?.some(
      (part) => part.types.includes("country") && part.shortText === country,
    )
  )
    return;
  const phone =
    destinationPhone(
      place.internationalPhoneNumber || place.nationalPhoneNumber || "",
      country,
    )?.number || "";
  return {
    placeId: place.id,
    name: place.displayName || "",
    address: place.formattedAddress || "",
    phone,
    location: place.location.toJSON(),
    mapsUrl: placeMapsUrl(place.id, place.displayName || "Google Maps"),
    closed:
      place.businessStatus === "CLOSED_PERMANENTLY" ||
      place.businessStatus === "CLOSED_TEMPORARILY",
    attributions: (place.attributions || []).map((a) => ({
      name: a.provider || "",
      uri: a.providerURI || "",
    })),
  };
}
export async function fetchBusiness(placeId: string, country: CallingCountry) {
  const { Place } = (await google.maps.importLibrary(
    "places",
  )) as google.maps.PlacesLibrary;
  const place = new Place({
    id: placeId,
    requestedLanguage: discoveryCountries[country].language,
  });
  await mapsTimeout(place.fetchFields({ fields: placeFields }));
  return businessFromPlace(place, country);
}
