// Browser-only discovery fixture. Never imported by the app. Intercepts every
// contact mutation and outbound call; no fake records reach the real database.
(() => {
  const originalFetch = window.fetch.bind(window);
  const state = (window.__discoveryFixture = {
    contacts: [],
    searches: [],
    callAttempts: [],
    locationMode: "denied",
    locationRequests: 0,
    pendingLocations: [],
  });
  window.fetch = async (input, init) => {
    const url = new URL(
      typeof input === "string" ? input : input.url,
      location.href,
    );
    if (url.pathname === "/api/maps-config")
      return Response.json({ key: "fixture-not-real", mapId: "fixture" });
    if (
      url.pathname === "/api/contacts" ||
      url.pathname === "/api/contacts/remove"
    ) {
      if (init?.method === "POST") {
        const value = JSON.parse(init.body);
        if (url.pathname.endsWith("/remove"))
          state.contacts = state.contacts.filter(
            (x) => x.placeId !== value.placeId,
          );
        else if (!state.contacts.some((x) => x.placeId === value.placeId))
          state.contacts.push({
            ...value,
            createdAt: new Date().toISOString(),
          });
      }
      return Response.json(state.contacts);
    }
    if (url.pathname === "/api/calls" && init?.method === "POST") {
      state.callAttempts.push(JSON.parse(init.body));
      return Response.json({ error: "TEST_INTERCEPTED" }, { status: 400 });
    }
    return originalFetch(input, init);
  };
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: {
      getCurrentPosition(success, failure) {
        state.locationRequests++;
        if (state.locationMode === "pending") {
          state.pendingLocations.push({ success, failure });
          return;
        }
        if (state.locationMode === "denied") failure({ code: 1 });
        else
          success({
            coords:
              state.locationMode === "outside"
                ? { latitude: 19.43, longitude: -99.13 }
                : { latitude: 35.69, longitude: 139.7 },
          });
      },
    },
  });
  const makePlace = (id) => ({
    id,
    displayName:
      id === "fixture_closed"
        ? "Closed Dental — TEST"
        : id === "fixture_no_phone"
          ? "No Phone Dental — TEST"
          : "Sakura Dental — TEST",
    formattedAddress: "Shinjuku, Tokyo — fictional test address",
    internationalPhoneNumber:
      id === "fixture_no_phone" ? null : "+81 70 1234 5678",
    addressComponents: [{ types: ["country"], shortText: "JP" }],
    businessStatus:
      id === "fixture_closed" ? "CLOSED_PERMANENTLY" : "OPERATIONAL",
    location: { toJSON: () => ({ lat: 35.69, lng: 139.7 }) },
    attributions: [],
  });
  class Place {
    constructor({ id }) {
      Object.assign(this, makePlace(id));
    }
    async fetchFields() {
      return { place: this };
    }
    static async searchByText(request) {
      state.searches.push(request);
      return {
        places: [
          makePlace("fixture_dental"),
          makePlace("fixture_closed"),
          makePlace("fixture_no_phone"),
        ],
      };
    }
  }
  class Map {
    constructor(element) {
      element.innerHTML =
        '<div style="height:100%;display:grid;place-content:center;text-align:center;padding:32px;background:#eee8f8;color:#71618a">ISOLATED TEST MAP<br>No Google connection or real businesses</div>';
    }
    addListener() {}
    panTo() {}
    setCenter() {}
    setZoom() {}
    fitBounds() {}
  }
  class Marker {
    constructor(options) {
      Object.assign(this, options);
    }
    addListener() {}
    append() {}
  }
  class Bounds {
    extend() {}
  }
  window.google = {
    maps: {
      importLibrary: async (library) =>
        library === "places"
          ? { Place }
          : library === "marker"
            ? { AdvancedMarkerElement: Marker }
            : { Map },
      ControlPosition: { LEFT_BOTTOM: "LEFT_BOTTOM" },
      RenderingType: { RASTER: "RASTER" },
      LatLngBounds: Bounds,
      event: { clearInstanceListeners() {} },
    },
  };
  return "Isolated fixture enabled; no contact/call writes reach the server.";
})();
