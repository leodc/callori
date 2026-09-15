import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync, chmodSync } from "node:fs";
import { resolve } from "node:path";
import type { Call, Profile } from "../lib/types";
const dir = resolve(process.env.CALLORI_DATA_DIR || ".callori");
mkdirSync(dir, { recursive: true, mode: 0o700 });
const file = resolve(dir, "callori.sqlite");
const db = new DatabaseSync(file);
chmodSync(file, 0o600);
db.exec(
  `PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS calls (id TEXT PRIMARY KEY, data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS profile (id INTEGER PRIMARY KEY, data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS webhooks (id TEXT PRIMARY KEY, received INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS requests (key TEXT PRIMARY KEY, call_id TEXT NOT NULL);`,
);
export const defaultProfile: Profile = {
  firstName: "",
  lastName: "",
  preferredName: "",
  age: "",
  sex: "",
  nationality: "",
  uiLanguage: "en",
};
export function profile(): Profile {
  const row = db.prepare("SELECT data FROM profile WHERE id=1").get();
  return row ? JSON.parse(row.data as string) : defaultProfile;
}
export function saveProfile(value: Profile) {
  db.prepare("INSERT OR REPLACE INTO profile VALUES(1,?)").run(
    JSON.stringify(value),
  );
  return value;
}
export function calls(): Call[] {
  return db
    .prepare("SELECT data FROM calls ORDER BY rowid DESC")
    .all()
    .map((x) => JSON.parse(x.data as string));
}
export function getCall(id: string): Call | undefined {
  const row = db.prepare("SELECT data FROM calls WHERE id=?").get(id);
  return row ? JSON.parse(row.data as string) : undefined;
}
export function saveCall(call: Call) {
  db.prepare(
    "INSERT INTO calls VALUES (?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data",
  ).run(call.id, JSON.stringify(call));
  return call;
}
export function seenEvent(id: string) {
  db.prepare("DELETE FROM webhooks WHERE received < ?").run(
    Date.now() - 86400000,
  );
  return (
    db.prepare("INSERT OR IGNORE INTO webhooks VALUES(?,?)").run(id, Date.now())
      .changes === 0
  );
}
export function requestCall(key: string) {
  const row = db.prepare("SELECT call_id FROM requests WHERE key=?").get(key);
  return row ? getCall(row.call_id as string) : undefined;
}
export function saveRequest(key: string, id: string) {
  db.prepare("INSERT INTO requests VALUES(?,?)").run(key, id);
}
db.exec(
  "CREATE TABLE IF NOT EXISTS provider_calls (id TEXT PRIMARY KEY, control_id TEXT NOT NULL)",
);
if (
  !(
    db.prepare("PRAGMA table_info(provider_calls)").all() as { name: string }[]
  ).some((column) => column.name === "hangup_id")
) {
  db.exec("ALTER TABLE provider_calls ADD COLUMN hangup_id TEXT");
}
export function hangupCommand(id: string): string {
  const row = db
    .prepare("SELECT hangup_id FROM provider_calls WHERE id=?")
    .get(id);
  if (row?.hangup_id) return row.hangup_id as string;
  const command = randomUUID();
  db.prepare("UPDATE provider_calls SET hangup_id=? WHERE id=?").run(
    command,
    id,
  );
  return command;
}
export function saveControl(id: string, controlId: string) {
  db.prepare(
    "INSERT INTO provider_calls (id, control_id) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET control_id=excluded.control_id",
  ).run(id, controlId);
}
export function getControl(id: string) {
  return db.prepare("SELECT control_id FROM provider_calls WHERE id=?").get(id)
    ?.control_id as string | undefined;
}
export function clearControl(id: string) {
  db.prepare("DELETE FROM provider_calls WHERE id=?").run(id);
}

export function pendingControls(): { id: string; control_id: string }[] {
  return db.prepare("SELECT id, control_id FROM provider_calls").all() as {
    id: string;
    control_id: string;
  }[];
}

// Persist only Place IDs, not a cached Google business directory.
db.exec(
  "CREATE TABLE IF NOT EXISTS contacts (place_id TEXT PRIMARY KEY, country TEXT NOT NULL, created_at TEXT NOT NULL)",
);
export function contacts() {
  return db
    .prepare(
      "SELECT place_id AS placeId, country, created_at AS createdAt FROM contacts ORDER BY created_at DESC",
    )
    .all();
}
export function saveContact(placeId: string, country: string) {
  const exists = db
    .prepare("SELECT place_id FROM contacts WHERE place_id=?")
    .get(placeId);
  if (
    !exists &&
    Number(db.prepare("SELECT COUNT(*) AS n FROM contacts").get()!.n) >= 100
  )
    throw new Error("CONTACT_LIMIT");
  db.prepare("INSERT OR IGNORE INTO contacts VALUES(?,?,?)").run(
    placeId,
    country,
    new Date().toISOString(),
  );
  return contacts();
}
export function removeContact(placeId: string) {
  db.prepare("DELETE FROM contacts WHERE place_id=?").run(placeId);
  return contacts();
}
