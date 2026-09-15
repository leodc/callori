import test, { after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  searchTerm,
  searchQuery,
  mapsSearchUrl,
  insideDestination,
  nearbyBounds,
} from "../lib/discovery";
import { businessFromPlace } from "../lib/google-maps";
import { contactSchema } from "../lib/validation";
import { buildCallInput, newPlan } from "../lib/call-plan";
process.env.CALLORI_DATA_DIR = mkdtempSync(join(tmpdir(), "callori-contacts-"));
const store = await import("../server/store");
after(() =>
  rmSync(process.env.CALLORI_DATA_DIR!, { recursive: true, force: true }),
);

test("discovery queries use a controlled Japanese vocabulary and encoded destination links", () => {
  assert.equal(searchTerm("appointment", "dentist", "JP"), "歯科");
  assert.equal(searchTerm("restaurant", "", "JP"), "レストラン");
  assert.equal(searchTerm("appointment", "other", "JP"), "");
  assert.equal(searchQuery("歯科", "新宿", "JP"), "歯科 新宿 日本");
  const url = new URL(mapsSearchUrl("歯科", "新宿 & x=1", "JP"));
  assert.equal(url.origin, "https://www.google.com");
  assert.equal(url.searchParams.get("query"), "歯科 新宿 & x=1 日本");
  assert.equal(url.searchParams.get("x"), null);
});
test("nearby discovery rejects out-of-region locations and restricts the search viewport", () => {
  assert.equal(insideDestination({ lat: 19.43, lng: -99.13 }, "JP"), false);
  assert.equal(insideDestination({ lat: NaN, lng: 139 }, "JP"), false);
  const point = { lat: 35.68, lng: 139.76 };
  assert.equal(insideDestination(point, "JP"), true);
  const bounds = nearbyBounds(point);
  assert.ok(bounds.north > point.lat && bounds.south < point.lat);
  assert.ok(bounds.east - bounds.west < 0.2);
});
test("Google results require a Japan address and a valid phone before dialing", () => {
  const place = {
    id: "test_place",
    displayName: "Test Dental",
    formattedAddress: "Tokyo",
    internationalPhoneNumber: "+81 70 1234 5678",
    addressComponents: [{ types: ["country"], shortText: "JP" }],
    location: { toJSON: () => ({ lat: 35.68, lng: 139.76 }) },
    businessStatus: "OPERATIONAL",
    attributions: [],
  } as unknown as google.maps.places.Place;
  assert.equal(businessFromPlace(place, "JP")?.phone, "+817012345678");
  assert.equal(
    businessFromPlace(
      {
        ...place,
        addressComponents: [{ types: ["country"], shortText: "US" }],
      } as google.maps.places.Place,
      "JP",
    ),
    undefined,
  );
  assert.equal(
    businessFromPlace(
      {
        ...place,
        internationalPhoneNumber: "+14155550123",
      } as google.maps.places.Place,
      "JP",
    )?.phone,
    "",
  );
  assert.equal(
    businessFromPlace(
      {
        ...place,
        businessStatus: "CLOSED_PERMANENTLY",
      } as google.maps.places.Place,
      "JP",
    )?.closed,
    true,
  );
});
test("saved contacts persist only place references, deduplicate, validate and enforce a bounded list", () => {
  assert.equal(
    contactSchema.safeParse({ placeId: "test_place", country: "JP" }).success,
    true,
  );
  assert.equal(
    contactSchema.safeParse({ placeId: "test_place", country: "US" }).success,
    false,
  );
  assert.equal(
    contactSchema.safeParse({
      placeId: "test_place",
      country: "JP",
      phone: "+817012345678",
    }).success,
    false,
  );
  store.saveContact("test_place", "JP");
  store.saveContact("test_place", "JP");
  assert.equal(store.contacts().length, 1);
  const db = new DatabaseSync(
    join(process.env.CALLORI_DATA_DIR!, "callori.sqlite"),
    { readOnly: true },
  );
  assert.deepEqual(
    db
      .prepare("PRAGMA table_info(contacts)")
      .all()
      .map((column) => column.name),
    ["place_id", "country", "created_at"],
  );
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM contacts").get()!.n, 1);
  db.close();
  for (let i = 1; i < 100; i++) store.saveContact(`test_${i}`, "JP");
  assert.throws(() => store.saveContact("overflow", "JP"), /CONTACT_LIMIT/);
  store.removeContact("test_place");
  assert.equal(store.contacts().length, 99);
});
test("choosing a business preserves its branch address and never creates call authorization", () => {
  const input = buildCallInput(
    {
      ...newPlan("appointment"),
      category: "dentist",
      reason: "Cleaning",
      business: "Test Dental",
      businessAddress: "Shinjuku, Tokyo",
      phone: "07012345678",
    },
    "en",
  );
  assert.match(input.context, /Business address: Shinjuku, Tokyo/);
  assert.match(input.constraints, /Ask the app user before confirming/);
  assert.equal(input.phone, "+817012345678");
});
