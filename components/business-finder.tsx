"use client";
import { useEffect, useRef, useState } from "react";
import {
  Bookmark,
  Check,
  ArrowLeft,
  ArrowRight,
  LoaderCircle,
  Phone,
  Sparkles,
  LocateFixed,
  MapPin,
  Search,
  Trash2,
  X,
} from "lucide-react";
import type { Locale } from "@/lib/types";
import type { CallingCountry } from "@/lib/phone";
import {
  discoveryCountries,
  insideDestination,
  nearbyBounds,
  searchQuery,
  type Business,
  type SavedContact,
} from "@/lib/discovery";
import {
  businessFromPlace,
  fetchBusiness,
  loadMaps,
  mapsTimeout,
  placeFields,
} from "@/lib/google-maps";

async function api(path: string, body?: unknown): Promise<unknown> {
  const response = await fetch(`/api/${path}`, {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error("REQUEST_FAILED");
  return response.json();
}
function safeLink(value: string) {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}
export default function BusinessFinder({
  country,
  initialTerm,
  categoryLabel,
  l,
  onChoose,
  onClose,
}: {
  country: CallingCountry;
  initialTerm: string;
  categoryLabel: string;
  l: Locale;
  onChoose: (business: Business) => void;
  onClose: () => void;
}) {
  const say = (en: string, es: string) => (l === "es" ? es : en);
  const destination = discoveryCountries[country];
  const dialog = useRef<HTMLDialogElement>(null);
  const mapElement = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.Map | null>(null);
  const markers = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const generation = useRef(0);
  const mounted = useRef(false);
  const [term, setTerm] = useState(initialTerm);
  const autoLocated = useRef(false);
  const lastSelected = useRef<string | undefined>(undefined);
  const nearPoint = useRef<{ lat: number; lng: number } | undefined>(undefined);
  const searchResults = useRef<Business[]>([]);
  const resultPanel = useRef<HTMLElement>(null);
  const detailHeading = useRef<HTMLHeadingElement>(null);
  const markerPins = useRef<HTMLElement[]>([]);
  const areaInput = useRef<HTMLInputElement>(null);
  const [locating, setLocating] = useState(false);
  const [locationNotice, setLocationNotice] = useState("");
  const [searchArea, setSearchArea] = useState("");
  const [area, setArea] = useState("");
  const [ready, setReady] = useState(false);
  const [configured, setConfigured] = useState<boolean | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [results, setResults] = useState<Business[]>([]);
  const [selected, setSelected] = useState<Business>();
  const [saved, setSaved] = useState<SavedContact[]>([]);
  const [tab, setTab] = useState<"search" | "saved">("search");
  const [searched, setSearched] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [savedCount, setSavedCount] = useState(10);
  const [unavailable, setUnavailable] = useState<SavedContact[]>([]);
  const requestError = say(
    "We couldn’t load the map or places. Close this view and try again.",
    "No pudimos cargar el mapa o los lugares. Cierra esta vista e inténtalo de nuevo.",
  );
  useEffect(() => {
    mounted.current = true;
    const initRun = ++generation.current;
    const element = dialog.current!;
    element.showModal();
    const previousAuthFailure = window.gm_authFailure;
    window.gm_authFailure = () => {
      if (mounted.current) {
        generation.current++;
        setReady(false);
        setBusy(false);
        setLocating(false);
        setError(requestError);
      }
    };
    void (async () => {
      try {
        const [config, contacts] = await Promise.all([
          api("maps-config") as Promise<{ key: string; mapId: string }>,
          api("contacts") as Promise<SavedContact[]>,
        ]);
        if (!mounted.current || initRun !== generation.current) return;
        setSaved(contacts.filter((contact) => contact.country === country));
        setConfigured(!!config.key);
        if (!config.key) return;
        await loadMaps(config.key);
        const { Map } = (await google.maps.importLibrary(
          "maps",
        )) as google.maps.MapsLibrary;
        await google.maps.importLibrary("marker");
        if (
          !mounted.current ||
          initRun !== generation.current ||
          !mapElement.current
        )
          return;
        map.current = new Map(mapElement.current, {
          center: destination.center,
          zoom: 11,
          mapId: config.mapId,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          cameraControl: false,
          zoomControl: true,
          zoomControlOptions: {
            position: google.maps.ControlPosition.LEFT_BOTTOM,
          },
          gestureHandling: "cooperative",
          renderingType: google.maps.RenderingType.RASTER,
        });
        map.current.addListener(
          "click",
          (event: google.maps.IconMouseEvent) => {
            if (event.placeId) {
              event.stop();
              void selectPlace(event.placeId);
            }
          },
        );
        setReady(true);
      } catch {
        if (mounted.current) setError(requestError);
      }
    })();
    return () => {
      mounted.current = false;
      generation.current++;
      markers.current.forEach((marker) => {
        marker.map = null;
      });
      if (map.current) google.maps.event.clearInstanceListeners(map.current);
      map.current = null;
      window.gm_authFailure = previousAuthFailure;
      element.close();
    };
    // A finder is mounted for one country/category and disposed on close.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (ready && !autoLocated.current) {
      autoLocated.current = true;
      locate();
    }
    // Ask once when the user opens the finder, after Maps is available.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);
  useEffect(() => {
    markerPins.current.forEach((pin) => {
      pin.classList.toggle("active", pin.dataset.placeId === selected?.placeId);
    });
    resultPanel.current?.scrollTo({ top: 0 });
    if (selected) {
      lastSelected.current = selected.placeId;
      detailHeading.current?.focus({ preventScroll: true });
    } else if (lastSelected.current) {
      const previous = Array.from(
        resultPanel.current?.querySelectorAll<HTMLButtonElement>(
          ".finder-result",
        ) || [],
      ).find((button) => button.dataset.placeId === lastSelected.current);
      previous?.focus({ preventScroll: true });
      lastSelected.current = undefined;
    }
  }, [selected]);
  async function showResults(items: Business[], token: number) {
    if (!mounted.current || token !== generation.current) return;
    const { AdvancedMarkerElement } = (await google.maps.importLibrary(
      "marker",
    )) as google.maps.MarkerLibrary;
    if (!mounted.current || token !== generation.current) return;
    markers.current.forEach((marker) => {
      marker.map = null;
    });
    markers.current = [];
    markerPins.current = [];
    setResults(items);
    setSelected(undefined);
    const bounds = new google.maps.LatLngBounds();
    for (const [index, item] of items.entries()) {
      const marker = new AdvancedMarkerElement({
        map: map.current,
        position: item.location,
        title: item.name,
        gmpClickable: true,
      });
      const pin = document.createElement("span");
      pin.className = "finder-pin";
      pin.textContent = String(index + 1);
      pin.dataset.placeId = item.placeId;
      marker.append(pin);
      markerPins.current.push(pin);
      marker.addListener("click", () => {
        setSelected(item);
        map.current?.panTo(item.location);
      });
      markers.current.push(marker);
      bounds.extend(item.location);
    }
    if (items.length === 1) {
      map.current?.setCenter(items[0].location);
      map.current?.setZoom(15);
    } else if (items.length)
      map.current?.fitBounds(bounds, {
        top: 160,
        right: 45,
        bottom: 45,
        left: 45,
      });
  }
  async function selectPlace(id: string) {
    setSelected(undefined);
    setLocating(false);
    setLocationNotice("");
    const token = ++generation.current;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const business = await fetchBusiness(id, country);
      if (!mounted.current || token !== generation.current) return;
      if (!business) throw new Error("OUTSIDE_COUNTRY");
      setSelected(business);
      map.current?.panTo(business.location);
    } catch {
      if (mounted.current && token === generation.current)
        setError(
          say(
            "This place is unavailable or outside Japan. Choose another result.",
            "Este lugar no está disponible o está fuera de Japón. Elige otro resultado.",
          ),
        );
    } finally {
      if (mounted.current && token === generation.current) setBusy(false);
    }
  }
  async function search(near?: { lat: number; lng: number }) {
    if (!ready || !term.trim() || (!near && !area.trim())) return;
    setLocating(false);
    setLocationNotice("");
    const token = ++generation.current;
    setBusy(true);
    setError("");
    setMessage("");
    setSelected(undefined);
    setTab("search");
    setUnavailable([]);
    try {
      const { Place } = (await google.maps.importLibrary(
        "places",
      )) as google.maps.PlacesLibrary;
      const { places } = await mapsTimeout(
        Place.searchByText({
          textQuery: searchQuery(term, near ? "" : area, country),
          fields: placeFields,
          language: destination.language,
          region: destination.region,
          maxResultCount: 10,
          locationRestriction: near ? nearbyBounds(near) : destination.bounds,
        }),
      );
      if (!mounted.current || token !== generation.current) return;
      const items = places
        .map((place) => businessFromPlace(place, country))
        .filter((item): item is Business => !!item);
      searchResults.current = items;
      setSearchArea(near ? say("Near you", "Cerca de ti") : area.trim());
      setSearched(true);
      await showResults(items, token);
    } catch {
      if (mounted.current && token === generation.current)
        setError(requestError);
    } finally {
      if (mounted.current && token === generation.current) setBusy(false);
    }
  }
  function locate() {
    if (!ready) return;
    const fallback = say(
      "You can still find a place. Enter a city, neighborhood or station in Japan.",
      "También podemos ayudarte sin ubicación. Escribe una ciudad, barrio o estación de Japón.",
    );
    if (!navigator.geolocation) {
      setLocationNotice(fallback);
      areaInput.current?.focus();
      return;
    }
    const token = ++generation.current;
    setLocating(true);
    setBusy(true);
    setError("");
    setMessage("");
    setLocationNotice("");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (!mounted.current || token !== generation.current) return;
        const point = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        setBusy(false);
        setLocating(false);
        if (!insideDestination(point, country)) {
          setLocationNotice(
            say(
              "We’re looking in Japan. Enter the city, neighborhood or station where you’d like to go.",
              "Estamos buscando en Japón. Escribe la ciudad, barrio o estación a la que quieres ir.",
            ),
          );
          areaInput.current?.focus();
          return;
        }
        nearPoint.current = point;
        map.current?.setCenter(point);
        map.current?.setZoom(14);
        if (term.trim()) void search(point);
      },
      () => {
        if (!mounted.current || token !== generation.current) return;
        setBusy(false);
        setLocating(false);
        setLocationNotice(fallback);
        areaInput.current?.focus();
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    );
  }
  async function returnToSearch() {
    if (tab === "search") return;
    const token = ++generation.current;
    setTab("search");
    setBusy(false);
    setLocating(false);
    setError("");
    setMessage("");
    setUnavailable([]);
    await showResults(searchResults.current, token);
  }
  async function showSaved(count = 10) {
    if (!ready) return;
    const token = ++generation.current;
    setTab("saved");
    setLocating(false);
    setSelected(undefined);
    setSavedCount(count);
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const batch = saved.slice(0, count);
      const responses = await Promise.allSettled(
        batch.map((contact) => fetchBusiness(contact.placeId, country)),
      );
      if (!mounted.current || token !== generation.current) return;
      const found: Business[] = [],
        missing: SavedContact[] = [];
      responses.forEach((response, index) => {
        if (response.status === "fulfilled" && response.value)
          found.push(response.value);
        else missing.push(batch[index]);
      });
      setUnavailable(missing);
      await showResults(found, token);
    } catch {
      if (mounted.current && token === generation.current)
        setError(requestError);
    } finally {
      if (mounted.current && token === generation.current) setBusy(false);
    }
  }
  async function save(placeId: string, remove = false) {
    setSaveBusy(true);
    setMessage("");
    try {
      const contacts = (await api(remove ? "contacts/remove" : "contacts", {
        placeId,
        country,
      })) as SavedContact[];
      if (!mounted.current) return;
      setSaved(contacts.filter((contact) => contact.country === country));
      setMessage(
        remove
          ? say("Contact removed.", "Contacto eliminado.")
          : say("Contact saved.", "Contacto guardado."),
      );
      if (remove && tab === "saved") {
        await showResults(
          results.filter((item) => item.placeId !== placeId),
          generation.current,
        );
        setUnavailable((items) =>
          items.filter((item) => item.placeId !== placeId),
        );
        if (selected?.placeId === placeId) setSelected(undefined);
      }
    } catch {
      if (mounted.current)
        setError(
          say(
            "We couldn’t save this change. Try again; you can save up to 100 contacts.",
            "No pudimos guardar el cambio. Inténtalo de nuevo; puedes guardar hasta 100 contactos.",
          ),
        );
    } finally {
      if (mounted.current) setSaveBusy(false);
    }
  }
  const isSaved =
    selected && saved.some((contact) => contact.placeId === selected.placeId);
  const working = busy && !locating;
  const resultsTitle =
    tab === "saved"
      ? say("Your saved places", "Tus lugares guardados")
      : searchArea || say("Places for your plans", "Un lugar para tus planes");
  return (
    <dialog
      ref={dialog}
      className="business-finder"
      aria-labelledby="finder-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <header className="finder-header">
        <span className="finder-brand-icon">
          <MapPin size={23} />
        </span>
        <div className="finder-heading">
          <span className="eyebrow">
            {say("CALLORI · FIND YOUR PLACE", "CALLORI · ENCUENTRA TU LUGAR")}
          </span>
          <h2 id="finder-title">
            {categoryLabel} <span>· {say("Japan", "Japón")}</span>
          </h2>
        </div>
        <button
          type="button"
          className="icon-button"
          onClick={onClose}
          autoFocus
          aria-label={say("Close search", "Cerrar búsqueda")}
        >
          <X />
        </button>
      </header>
      <div className="finder-content">
        <div className="finder-map-stage">
          <div
            className="finder-map"
            ref={mapElement}
            aria-label={say(
              "Map of businesses in Japan",
              "Mapa de negocios en Japón",
            )}
          />
          {!ready && (
            <div className="finder-map-placeholder">
              <MapPin size={32} />
              <p>
                {configured === false
                  ? say(
                      "Place search is temporarily unavailable. You can still enter a phone number in your request.",
                      "La búsqueda no está disponible por ahora. Puedes agregar el teléfono directamente en tu solicitud.",
                    )
                  : error
                    ? say("Map unavailable", "Mapa no disponible")
                    : say("Preparing your map…", "Preparando tu mapa…")}
              </p>
            </div>
          )}
          <div className="finder-map-controls">
            <form
              className="finder-search-box"
              onSubmit={(event) => {
                event.preventDefault();
                void search(area.trim() ? undefined : nearPoint.current);
              }}
            >
              {!initialTerm && (
                <label className="finder-custom-term">
                  <span className="sr-only">
                    {say(
                      "Business name or service",
                      "Nombre del negocio o servicio",
                    )}
                  </span>
                  <input
                    value={term}
                    maxLength={120}
                    disabled={working}
                    onChange={(event) => setTerm(event.target.value)}
                    placeholder={say(
                      "Business name or service",
                      "Nombre del negocio o servicio",
                    )}
                  />
                </label>
              )}
              <div className="finder-area-row">
                <Search size={20} aria-hidden="true" />
                <label>
                  <span className="sr-only">
                    {say(
                      "City, neighborhood or station",
                      "Ciudad, barrio o estación",
                    )}
                  </span>
                  <input
                    ref={areaInput}
                    value={area}
                    maxLength={200}
                    disabled={working}
                    onChange={(event) => setArea(event.target.value)}
                    placeholder={say(
                      "Search another area…",
                      "Buscar en otra zona…",
                    )}
                  />
                </label>
                <button
                  type="submit"
                  className="finder-search-submit"
                  disabled={
                    !ready ||
                    working ||
                    !term.trim() ||
                    (!area.trim() && !nearPoint.current)
                  }
                  aria-label={say("Search this area", "Buscar en esta zona")}
                >
                  {working ? (
                    <LoaderCircle size={19} className="spin" />
                  ) : (
                    <ArrowRight size={19} />
                  )}
                </button>
              </div>
            </form>
            <div className="finder-map-chips">
              <button
                type="button"
                className={`finder-near ${searchArea === say("Near you", "Cerca de ti") && tab === "search" ? "active" : ""}`}
                disabled={!ready || busy}
                onClick={locate}
              >
                {locating ? (
                  <LoaderCircle size={16} className="spin" />
                ) : (
                  <LocateFixed size={16} />
                )}
                {say("Near me", "Cerca de mí")}
              </button>
              <span className="finder-context-chip">
                <Sparkles size={14} />
                {categoryLabel}
              </span>
            </div>
            {(locating || locationNotice) && tab === "search" && (
              <div className="finder-location-note" role="status">
                <LocateFixed size={18} />
                <div>
                  <strong>
                    {locating
                      ? say(
                          "Allow location to find nearby places",
                          "Permite tu ubicación para ver lugares cercanos",
                        )
                      : say("Let’s find your area", "Busquemos en tu zona")}
                  </strong>
                  <p>
                    {locating
                      ? say(
                          "Or search an area above. Callori won’t save your location.",
                          "O busca una zona arriba. Callori no guarda tu ubicación.",
                        )
                      : locationNotice}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
        <aside className="finder-panel">
          <div className="finder-tabs" aria-label={say("Places", "Lugares")}>
            <button
              type="button"
              aria-pressed={tab === "search"}
              disabled={!ready || saveBusy}
              onClick={() => void returnToSearch()}
            >
              <MapPin size={16} />
              {say("Explore", "Explorar")}
            </button>
            <button
              type="button"
              aria-pressed={tab === "saved"}
              disabled={!ready || working || saveBusy}
              onClick={() => {
                if (tab !== "saved") void showSaved();
              }}
            >
              <Bookmark size={16} />
              {say("Saved", "Guardados")}
              <span>{saved.length}</span>
            </button>
          </div>
          {error && (
            <div className="finder-feedback alert error" role="alert">
              {error}
            </div>
          )}
          {message && (
            <p role="status" className="finder-feedback finder-confirmation">
              <Check size={16} />
              {message}
            </p>
          )}
          <section
            className="finder-results"
            ref={resultPanel}
            aria-busy={working}
            aria-label={say("Search results", "Resultados de búsqueda")}
          >
            {selected ? (
              <article className="finder-selected">
                <button
                  type="button"
                  className="finder-back"
                  onClick={() => setSelected(undefined)}
                >
                  <ArrowLeft size={16} />
                  {say("Back to places", "Volver a los lugares")}
                </button>
                <div className="finder-place-icon">
                  <MapPin size={28} />
                </div>
                <span className="eyebrow">
                  {say("A PLACE FOR YOUR PLANS", "UN LUGAR PARA TUS PLANES")}
                </span>
                <h3 ref={detailHeading} tabIndex={-1}>
                  {selected.name}
                </h3>
                <p className="finder-detail-line">
                  <MapPin size={17} />
                  {selected.address}
                </p>
                <p className="finder-detail-line">
                  <Phone size={17} />
                  {selected.phone ||
                    say("No phone number available", "Sin teléfono disponible")}
                </p>
                {selected.closed && (
                  <p className="phone-error">
                    {say(
                      "Google lists this place as closed.",
                      "Google indica que este lugar está cerrado.",
                    )}
                  </p>
                )}
                <div className="finder-actions">
                  <button
                    type="button"
                    className="button primary"
                    disabled={!selected.phone || selected.closed || busy}
                    onClick={() => onChoose(selected)}
                  >
                    {say("Choose this place", "Elegir este lugar")}
                    <ArrowRight size={17} />
                  </button>
                  <button
                    type="button"
                    className="finder-save"
                    disabled={saveBusy}
                    onClick={() => void save(selected.placeId, !!isSaved)}
                  >
                    {saveBusy ? (
                      <LoaderCircle size={16} className="spin" />
                    ) : isSaved ? (
                      <Check size={16} />
                    ) : (
                      <Bookmark size={16} />
                    )}
                    {isSaved
                      ? say("Remove saved", "Quitar de guardados")
                      : say("Save contact", "Guardar contacto")}
                  </button>
                </div>
                <small>
                  {say(
                    "Next, we’ll prepare your call. You decide when to dial.",
                    "Después prepararemos tu llamada. Tú decides cuándo llamar.",
                  )}
                </small>
                <div className="finder-place-source">
                  <a
                    href={selected.mapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Google Maps
                  </a>
                  {selected.attributions
                    .filter((a) => safeLink(a.uri))
                    .map((a) => (
                      <a
                        key={a.uri}
                        href={a.uri}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {a.name}
                      </a>
                    ))}
                </div>
              </article>
            ) : (
              <>
                <div className="finder-results-heading">
                  <span className="eyebrow">
                    {tab === "saved"
                      ? say("READY FOR NEXT TIME", "A MANO PARA LA PRÓXIMA")
                      : say("CHOOSE WHO WE’LL CALL", "ELIGE A QUIÉN LLAMAMOS")}
                  </span>
                  <h3>{resultsTitle}</h3>
                  <p role="status">
                    {working
                      ? say("Finding places…", "Buscando lugares…")
                      : results.length
                        ? say(
                            `${results.length} places · Select one to see details`,
                            `${results.length} lugares · Elige uno para ver los detalles`,
                          )
                        : say(
                            "You choose the place. We’ll make the call.",
                            "Tú eliges el lugar. Nosotros hacemos la llamada.",
                          )}
                  </p>
                </div>
                {working ? (
                  <div className="finder-skeletons" aria-hidden="true">
                    {[0, 1, 2, 3].map((i) => (
                      <div className="finder-skeleton" key={i}>
                        <span />
                        <div>
                          <i />
                          <i />
                          <i />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  results.map((item, index) => (
                    <button
                      type="button"
                      className="finder-result"
                      data-place-id={item.placeId}
                      key={item.placeId}
                      onClick={() => {
                        setSelected(item);
                        map.current?.panTo(item.location);
                      }}
                    >
                      <span className="finder-result-number">{index + 1}</span>
                      <div>
                        <strong>{item.name}</strong>
                        <p>{item.address}</p>
                        <small
                          className={
                            item.closed || !item.phone ? "unavailable" : ""
                          }
                        >
                          {item.closed ? (
                            say("Closed", "Cerrado")
                          ) : item.phone ? (
                            <>
                              <Phone size={12} />
                              {say("Phone available", "Teléfono disponible")}
                            </>
                          ) : (
                            say("No phone listed", "Sin teléfono publicado")
                          )}
                        </small>
                      </div>
                      <ArrowRight size={15} className="finder-result-arrow" />
                    </button>
                  ))
                )}
                {!working &&
                  unavailable.map((contact) => (
                    <div className="finder-unavailable" key={contact.placeId}>
                      <span>
                        {say(
                          "Saved place unavailable",
                          "Lugar guardado no disponible",
                        )}
                      </span>
                      <button
                        type="button"
                        disabled={saveBusy}
                        className="icon-button"
                        aria-label={say(
                          "Remove unavailable contact",
                          "Eliminar contacto no disponible",
                        )}
                        onClick={() => void save(contact.placeId, true)}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                {!busy && !results.length && !unavailable.length && (
                  <div className="finder-empty">
                    <span className="finder-empty-icon">
                      {tab === "saved" ? (
                        <Bookmark size={25} />
                      ) : (
                        <MapPin size={25} />
                      )}
                    </span>
                    <h3>
                      {tab === "saved"
                        ? say(
                            "Good places are worth keeping.",
                            "Hay lugares que vale la pena guardar.",
                          )
                        : searched
                          ? say(
                              "Let’s try another area.",
                              "Probemos en otra zona.",
                            )
                          : say(
                              "Your next plan starts here.",
                              "Tu próximo plan empieza aquí.",
                            )}
                    </h3>
                    <p>
                      {tab === "saved"
                        ? say(
                            "Save a contact from its details. It will be here for your next call.",
                            "Guarda un contacto desde sus detalles. Lo tendrás aquí para tu próxima llamada.",
                          )
                        : searched
                          ? say(
                              "No places found this time. Try a nearby neighborhood or station.",
                              "No encontramos lugares esta vez. Prueba con un barrio o estación cercana.",
                            )
                          : say(
                              "Use your location or search an area on the map to see places here.",
                              "Usa tu ubicación o busca una zona en el mapa para ver lugares aquí.",
                            )}
                    </p>
                  </div>
                )}
                {tab === "saved" && savedCount < saved.length && (
                  <button
                    type="button"
                    className="button secondary finder-more"
                    disabled={busy}
                    onClick={() => void showSaved(savedCount + 10)}
                  >
                    {say("Show more saved places", "Ver más lugares guardados")}
                  </button>
                )}
                {results.length > 0 && (
                  <div className="maps-attribution">
                    Google Maps
                    {Array.from(
                      new Map(
                        results
                          .flatMap((item) => item.attributions)
                          .filter((a) => safeLink(a.uri))
                          .map((a) => [a.uri, a]),
                      ).values(),
                    ).map((a) => (
                      <a
                        key={a.uri}
                        href={a.uri}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {" "}
                        · {a.name}
                      </a>
                    ))}
                  </div>
                )}
              </>
            )}
          </section>
        </aside>
      </div>
      <footer className="finder-footer">
        <span>
          {say(
            "Location is shared with Google for this search, never saved by Callori.",
            "Tu ubicación se comparte con Google para buscar, Callori no la guarda.",
          )}
        </span>
        <span>
          <a
            href="https://policies.google.com/privacy"
            target="_blank"
            rel="noopener noreferrer"
          >
            {say("Privacy", "Privacidad")}
          </a>{" "}
          ·{" "}
          <a
            href="https://maps.google.com/help/terms_maps/"
            target="_blank"
            rel="noopener noreferrer"
          >
            {say("Google Maps terms", "Términos de Google Maps")}
          </a>
        </span>
      </footer>
    </dialog>
  );
}
