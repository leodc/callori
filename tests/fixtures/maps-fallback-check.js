// Run after maps-flow-check.js in the same isolated browser session.
(async () => {
  const s = window.__discoveryFixture;
  const wait = async (fn) => {
    for (let i = 0; i < 150; i++) {
      if (fn()) return;
      await new Promise((r) => setTimeout(r, 30));
    }
    throw Error("Timeout");
  };
  const close = async () => {
    document.querySelector('[aria-label="Cerrar búsqueda"]').click();
    await wait(() => !document.querySelector("dialog"));
  };
  const open = () =>
    [...document.querySelectorAll("button")]
      .find((x) => x.textContent.trim() === "Elegir otro lugar")
      .click();
  const assert = (v, msg) => {
    if (!v) throw Error(msg);
  };
  await close();
  for (const mode of ["denied", "outside"]) {
    s.locationMode = mode;
    const before = s.searches.length;
    open();
    await wait(() =>
      document
        .querySelector(".finder-location-note")
        ?.textContent.includes("Busquemos"),
    );
    assert(
      s.searches.length === before,
      "No search without an eligible location",
    );
    assert(
      !document.querySelector(".finder-area-row input").disabled,
      "Area search remains available",
    );
    assert(
      document
        .querySelector(".finder-location-note")
        .textContent.includes(
          mode === "denied" ? "sin ubicación" : "buscando en Japón",
        ),
      "Appropriate fallback",
    );
    await close();
  }
  s.locationMode = "pending";
  open();
  await wait(() => s.pendingLocations.length === 2);
  await close();
  const before = s.searches.length;
  s.pendingLocations[1].success({
    coords: { latitude: 35.69, longitude: 139.7 },
  });
  await new Promise((r) => setTimeout(r, 100));
  assert(s.searches.length === before, "Closing cancels pending location work");
  const original = window.fetch;
  window.fetch = async (input, init) =>
    String(input) === "/api/maps-config"
      ? Response.json({ key: "", mapId: "" })
      : original(input, init);
  const locations = s.locationRequests;
  open();
  await wait(() =>
    document
      .querySelector(".finder-map-placeholder")
      ?.textContent.includes("no está disponible"),
  );
  assert(
    s.locationRequests === locations,
    "No geolocation requested when Maps is unavailable",
  );
  assert(
    !document.querySelector(".finder-external"),
    "No external search fallback",
  );
  const dialog = document.querySelector("dialog");
  assert(
    dialog.scrollWidth <= dialog.clientWidth,
    "No mobile horizontal overflow",
  );
  return { passed: true, checks: 10, callAttempts: s.callAttempts.length };
})();
