// Run after maps-browser.js on the restaurant wizard; uses isolated data only.
(async () => {
  const s = window.__discoveryFixture;
  const wait = async (test) => {
    for (let i = 0; i < 150; i++) {
      if (test()) return;
      await new Promise((r) => setTimeout(r, 30));
    }
    throw Error("UI timeout");
  };
  const click = (label) => {
    const b = [...document.querySelectorAll("button")].find(
      (b) => b.textContent.trim() === label,
    );
    if (!b || b.disabled) throw Error("Unavailable button " + label);
    b.click();
  };
  const assert = (v, msg) => {
    if (!v) throw Error(msg);
  };
  const results = () => document.querySelectorAll(".finder-result");
  s.locationMode = "inside";
  click("Ayúdame a encontrar un lugar");
  await wait(() => results().length === 3);
  assert(s.locationRequests === 1, "One automatic location request");
  assert(
    s.searches.length === 1 && s.searches[0].textQuery === "レストラン 日本",
    "Automatic contextual Japanese search",
  );
  assert(
    document.querySelectorAll(".finder-search-box input").length === 1,
    "Only area input for a known category",
  );
  assert(!document.querySelector(".finder-external"), "No external search CTA");
  results()[1].click();
  await wait(() => document.querySelector(".finder-actions"));
  assert(
    document.querySelector(".finder-actions .primary").disabled,
    "Closed place cannot be chosen",
  );
  click("Volver a los lugares");
  await wait(() => results().length === 3);
  results()[2].click();
  await wait(() => document.querySelector(".finder-actions"));
  assert(
    document.querySelector(".finder-actions .primary").disabled,
    "Missing phone cannot be chosen",
  );
  click("Volver a los lugares");
  await wait(() => results().length === 3);
  results()[0].click();
  await wait(() => document.querySelector(".finder-actions"));
  click("Guardar contacto");
  await wait(
    () =>
      s.contacts.length === 1 &&
      document.querySelector(".finder-save")?.textContent.includes("Quitar"),
  );
  assert(
    Object.keys(s.contacts[0]).sort().join(",") === "country,createdAt,placeId",
    "Only a reference was saved",
  );
  click("Elegir este lugar");
  await wait(() => !document.querySelector("dialog"));
  assert(
    document.body.textContent.includes("Sakura Dental — TEST"),
    "Business carried back to wizard",
  );
  assert(s.callAttempts.length === 0, "Choosing does not dial");
  click("Elegir otro lugar");
  await wait(() => results().length === 3);
  click("Guardados1");
  await wait(() => results().length === 1);
  results()[0].click();
  await wait(() => document.querySelector(".finder-actions"));
  click("Quitar de guardados");
  await wait(
    () =>
      s.contacts.length === 0 && !document.querySelector(".finder-selected"),
  );
  click("Explorar");
  await wait(() => results().length === 3);
  assert(
    s.searches.length === 2,
    "Switching tabs restores results without another search",
  );
  document.querySelector('[aria-label="Cerrar búsqueda"]').click();
  await wait(() => !document.querySelector("dialog"));
  s.locationMode = "pending";
  click("Elegir otro lugar");
  await wait(() => s.pendingLocations.length === 1);
  const field = document.querySelector(".finder-area-row input");
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(
    field,
    "Shibuya",
  );
  field.dispatchEvent(new Event("input", { bubbles: true }));
  await wait(() => !document.querySelector(".finder-search-submit").disabled);
  document.querySelector(".finder-search-submit").click();
  await wait(() => results().length === 3);
  const before = s.searches.length;
  s.pendingLocations[0].success({
    coords: { latitude: 35.69, longitude: 139.7 },
  });
  await new Promise((r) => setTimeout(r, 150));
  assert(
    s.searches.length === before &&
      document.querySelector(".finder-results-heading h3").textContent ===
        "Shibuya",
    "Late location never replaces manual area",
  );
  return {
    passed: true,
    checks: 11,
    locationRequests: s.locationRequests,
    searches: s.searches.length,
    contacts: s.contacts.length,
    callAttempts: s.callAttempts.length,
  };
})();
