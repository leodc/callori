// Isolated HTTP lifecycle check. No provider credentials, calls or production data.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer, connect } from "node:net";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { setTimeout as delay } from "node:timers/promises";
const dir = mkdtempSync(join(tmpdir(), "callori-http-"));
const probe = createServer();
probe.listen(0, "127.0.0.1");
await once(probe, "listening");
const port = probe.address().port;
await new Promise((resolve) => probe.close(resolve));
const env = {
  ...process.env,
  CALLORI_DATA_DIR: dir,
  VOICE_PORT: String(port),
  CALLORI_INTERNAL_TOKEN: "test-only-internal-token-32-characters",
  LIVE_CALLS_ENABLED: "false",
  OPENAI_API_KEY: "",
  TELNYX_API_KEY: "",
  TELNYX_CONNECTION_ID: "",
  TELNYX_FROM_NUMBER: "",
  TELNYX_PUBLIC_KEY: "",
  PUBLIC_BASE_URL: "",
  ALLOWED_PHONE_NUMBERS: "",
  GOOGLE_MAPS_BROWSER_KEY: "test-browser-key-not-a-secret",
};
const children = [];
function start() {
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "server/index.ts"],
    { env, stdio: ["ignore", "pipe", "pipe"] },
  );
  children.push(child);
  child.stdout.resume();
  child.stderr.resume();
  return child;
}
const base = `http://127.0.0.1:${port}`;
let db;
try {
  const first = start();
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`${base}/healthz`)).ok) break;
    } catch {}
    assert.equal(first.exitCode, null, "server exited before becoming healthy");
    if (i === 99) throw new Error("startup timeout");
    await delay(50);
  }
  assert.equal((await fetch(`${base}/state`)).status, 401);
  assert.equal(
    (await fetch(`${base}/webhooks/telnyx`, { method: "POST", body: "{}" }))
      .status,
    401,
  );
  assert.equal(
    (
      await fetch(`${base}/webhooks/telnyx`, {
        method: "POST",
        body: "x".repeat(33000),
      })
    ).status,
    413,
  );
  const auth = {
    Authorization: `Bearer ${env.CALLORI_INTERNAL_TOKEN}`,
    "Content-Type": "application/json",
  };
  assert.equal((await fetch(`${base}/contacts`)).status, 401);
  assert.equal((await fetch(`${base}/maps-config`)).status, 401);
  assert.equal(
    (await (await fetch(`${base}/maps-config`, { headers: auth })).json()).key,
    env.GOOGLE_MAPS_BROWSER_KEY,
  );
  const contact = { placeId: "test_place", country: "JP" };
  for (let i = 0; i < 2; i++)
    assert.equal(
      (
        await fetch(`${base}/contacts`, {
          method: "POST",
          headers: auth,
          body: JSON.stringify(contact),
        })
      ).status,
      200,
    );
  assert.equal(
    (await (await fetch(`${base}/contacts`, { headers: auth })).json()).length,
    1,
  );
  assert.equal(
    (
      await fetch(`${base}/contacts`, {
        method: "POST",
        headers: auth,
        body: JSON.stringify({ ...contact, phone: "+817012345678" }),
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await fetch(`${base}/contacts/remove`, {
        method: "POST",
        headers: auth,
        body: JSON.stringify(contact),
      })
    ).status,
    200,
  );
  assert.equal(
    (await (await fetch(`${base}/contacts`, { headers: auth })).json()).length,
    0,
  );
  db = new DatabaseSync(join(dir, "callori.sqlite"));
  const seeded = {
    id: "00000000-0000-4000-8000-000000000001",
    mode: "live",
    status: "connected",
    createdAt: new Date().toISOString(),
    transcript: [],
    uiLanguage: "en",
  };
  db.prepare("INSERT INTO calls VALUES(?,?)").run(
    seeded.id,
    JSON.stringify(seeded),
  );
  const duplicate = start();
  const [code] = await once(duplicate, "exit");
  assert.notEqual(code, 0, "second service must fail to bind");
  assert.equal(
    JSON.parse(
      db.prepare("SELECT data FROM calls WHERE id=?").get(seeded.id).data,
    ).status,
    "connected",
    "duplicate startup changed a live call",
  );
  await new Promise((resolve) => {
    const socket = connect(port, "127.0.0.1", () =>
      socket.write(
        "GET http://[ HTTP/1.1\r\nHost: localhost\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n",
      ),
    );
    socket.on("data", () => {});
    socket.on("error", () => {});
    socket.on("close", resolve);
    socket.setTimeout(2000, () => socket.destroy());
  });
  assert.equal((await fetch(`${base}/healthz`)).status, 200);
  const exit = once(first, "exit");
  first.kill("SIGTERM");
  assert.equal((await exit)[0], 0);
  console.log(
    "PASS: health, contacts/config API, API/signature guards, body limit, duplicate-start isolation, malformed upgrade and graceful shutdown.",
  );
} finally {
  for (const child of children)
    if (child.exitCode === null) {
      const exit = once(child, "exit");
      child.kill("SIGKILL");
      await exit;
    }
  db?.close();
  rmSync(dir, { recursive: true, force: true });
}
