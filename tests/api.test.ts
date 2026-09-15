import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { NextRequest } from "next/server";
process.env.CALLORI_DATA_DIR = mkdtempSync(join(tmpdir(), "callori-api-"));
const { GET, POST } = await import("../app/api/[...path]/route");
const originalFetch = globalThis.fetch;
after(() => {
  globalThis.fetch = originalFetch;
  rmSync(process.env.CALLORI_DATA_DIR!, { recursive: true, force: true });
});
function request(
  method: string,
  headers: Record<string, string> = {},
  body?: unknown,
) {
  return new NextRequest("http://localhost:3000/api/calls", {
    method,
    headers: { host: "localhost:3000", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
const context = { params: Promise.resolve({ path: ["calls"] }) };
test("rejects remote Host headers and cross-origin or missing-origin mutations", async () => {
  assert.equal(
    (await GET(request("GET", { host: "attacker.test" }), context)).status,
    403,
  );
  assert.equal(
    (
      await POST(
        request(
          "POST",
          {
            "Content-Type": "application/json",
            origin: "https://attacker.test",
          },
          {},
        ),
        context,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await POST(
        request("POST", { "Content-Type": "application/json" }, {}),
        context,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await POST(
        request(
          "POST",
          { origin: "http://localhost:3000", "Content-Type": "text/plain" },
          {},
        ),
        context,
      )
    ).status,
    415,
  );
});
test("only forwards approved routes and enforces body limits", async () => {
  assert.equal(
    (
      await GET(request("GET"), {
        params: Promise.resolve({ path: ["..", "private"] }),
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await POST(
        request(
          "POST",
          {
            "Content-Type": "application/json",
            origin: "http://localhost:3000",
          },
          "x".repeat(33000),
        ),
        context,
      )
    ).status,
    413,
  );
});
test("keeps credentials on the server and relays idempotency without cache", async () => {
  let called = false;
  globalThis.fetch = async (url, init) => {
    called = true;
    assert.equal(String(url), "http://127.0.0.1:3001/calls");
    assert.match(
      (init?.headers as Record<string, string>).Authorization,
      /^Bearer [a-f0-9]{64}$/,
    );
    assert.equal(
      (init?.headers as Record<string, string>)["Idempotency-Key"],
      "test-id",
    );
    return Response.json(
      { id: "test-call", status: "dialing" },
      { status: 201 },
    );
  };
  const result = await POST(
    request(
      "POST",
      {
        "Content-Type": "application/json",
        origin: "http://localhost:3000",
        "Idempotency-Key": "test-id",
      },
      { objective: "test" },
    ),
    context,
  );
  assert.equal(called, true);
  assert.equal(result.status, 201);
  assert.equal(result.headers.get("cache-control"), "no-store");
  assert.equal(result.headers.get("authorization"), null);
  assert.deepEqual(await result.json(), { id: "test-call", status: "dialing" });
});
test("service outage is a readable error without exposing internal details", async () => {
  globalThis.fetch = async () => {
    throw new Error("secret internals");
  };
  const result = await GET(request("GET"), context);
  assert.equal(result.status, 503);
  assert.deepEqual(await result.json(), { error: "SERVICE_UNAVAILABLE" });
});

test("rejects oversized chunked bodies before buffering the entire upload", async () => {
  const { readLimitedBody, BodyTooLarge } = await import("../lib/request-body");
  let reads = 0,
    cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      reads++;
      controller.enqueue(new Uint8Array(8192));
    },
    cancel() {
      cancelled = true;
    },
  });
  await assert.rejects(() => readLimitedBody(stream), BodyTooLarge);
  assert.equal(cancelled, true);
  assert.ok(reads <= 6);
});

test("discovery API routes preserve local access guards and the internal token", async () => {
  globalThis.fetch = async (url, init) => {
    assert.match(String(url), /\/(maps-config|contacts(?:\/remove)?)$/);
    assert.match(
      new Headers(init?.headers).get("authorization") || "",
      /^Bearer /,
    );
    return Response.json([]);
  };
  for (const path of [["maps-config"], ["contacts"], ["contacts", "remove"]]) {
    assert.equal(
      (await GET(request("GET"), { params: Promise.resolve({ path }) })).status,
      200,
    );
    assert.equal(
      (
        await GET(request("GET", { host: "evil.test" }), {
          params: Promise.resolve({ path }),
        })
      ).status,
      403,
    );
  }
});
