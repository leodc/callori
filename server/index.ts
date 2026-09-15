import "dotenv/config";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { WebSocketServer } from "ws";
import { z } from "zod";
import { internalToken } from "../lib/internal-token";
import {
  answerSchema,
  callSchema,
  profileSchema,
  contactSchema,
} from "../lib/validation";
import { terminal } from "../lib/types";
import {
  answerUser,
  attachMedia,
  authorizeMedia,
  createCall,
  endCall,
  recoverCalls,
  recoverOrphanedCalls,
  remoteHangup,
  sessions,
  update,
} from "./engine";
import {
  calls,
  getCall,
  profile,
  requestCall,
  saveProfile,
  seenEvent,
  saveControl,
  getControl,
  pendingControls,
  contacts,
  saveContact,
  removeContact,
} from "./store";
import { readiness, safeEqual, verifyWebhook } from "./security";
const token = internalToken();
let creating = false;
let lastLive = 0;
let accepting = false;
let shuttingDown = false;
async function body(req: IncomingMessage) {
  let size = 0;
  const parts: Buffer[] = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 32768) throw new Error("BODY_TOO_LARGE");
    parts.push(chunk);
  }
  return Buffer.concat(parts).toString("utf8");
}
function json(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(JSON.stringify(data));
}
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", "http://localhost");
    if (url.pathname === "/healthz" && req.method === "GET")
      return json(res, accepting ? 200 : 503, {
        status: accepting ? "ok" : "starting_or_stopping",
      });
    if (!accepting) return json(res, 503, { error: "SERVICE_UNAVAILABLE" });
    if (url.pathname === "/webhooks/telnyx" && req.method === "POST") {
      const raw = await body(req);
      if (
        !verifyWebhook(
          raw,
          String(req.headers["telnyx-timestamp"] || ""),
          String(req.headers["telnyx-signature-ed25519"] || ""),
          process.env.TELNYX_PUBLIC_KEY || "",
        )
      )
        return json(res, 401, { error: "INVALID_SIGNATURE" });
      const event = z
        .object({
          data: z.object({
            id: z.string().min(1),
            event_type: z.string(),
            occurred_at: z.string(),
            payload: z
              .object({
                call_control_id: z.string(),
                client_state: z.string().optional(),
              })
              .passthrough(),
          }),
        })
        .parse(JSON.parse(raw)).data;
      if (seenEvent(event.id)) return json(res, 200, { ok: true });
      const id = event.payload.client_state
        ? Buffer.from(event.payload.client_state, "base64").toString()
        : [...sessions.entries()].find(
            ([, s]) => s.controlId === event.payload.call_control_id,
          )?.[0];
      if (id && getCall(id)?.mode === "live") {
        const knownControl = getControl(id);
        if (knownControl && knownControl !== event.payload.call_control_id)
          return json(res, 200, { ok: true });
        if (event.event_type === "call.hangup") {
          await remoteHangup(id);
        } else if (
          ["call.initiated", "call.answered"].includes(event.event_type)
        ) {
          saveControl(id, event.payload.call_control_id);
          const session = sessions.get(id);
          if (session) session.controlId = event.payload.call_control_id;
          if (terminal(getCall(id)!.status)) void recoverOrphanedCalls();
          else if (event.event_type === "call.answered")
            update(id, (c) => {
              if (c.status === "dialing") c.status = "connected";
            });
        }
      }
      return json(res, 200, { ok: true });
    }
    if (!safeEqual(String(req.headers.authorization || ""), `Bearer ${token}`))
      return json(res, 401, { error: "UNAUTHORIZED" });
    if (req.method === "GET" && url.pathname === "/state")
      return json(res, 200, {
        calls: calls(),
        profile: profile(),
        readiness: (() => {
          const configured = readiness();
          const recovered = !pendingControls().some((row) => {
            const call = getCall(row.id);
            return !call || terminal(call.status);
          });
          return {
            ready: configured.ready && recovered,
            checks: [
              ...configured.checks,
              { name: "CALL_RECOVERY", configured: recovered },
            ],
          };
        })(),
      });
    if (req.method === "GET" && url.pathname === "/maps-config")
      return json(res, 200, {
        key: process.env.GOOGLE_MAPS_BROWSER_KEY || "",
        mapId: process.env.GOOGLE_MAPS_MAP_ID || "DEMO_MAP_ID",
      });
    if (req.method === "GET" && url.pathname === "/contacts")
      return json(res, 200, contacts());
    if (
      req.method === "POST" &&
      ["/contacts", "/contacts/remove"].includes(url.pathname)
    ) {
      const input = contactSchema.parse(JSON.parse(await body(req)));
      return json(
        res,
        200,
        url.pathname === "/contacts"
          ? saveContact(input.placeId, input.country)
          : removeContact(input.placeId),
      );
    }
    if (req.method === "PUT" && url.pathname === "/profile")
      return json(
        res,
        200,
        saveProfile(profileSchema.parse(JSON.parse(await body(req)))),
      );
    if (req.method === "POST" && url.pathname === "/calls") {
      const key = z.string().uuid().parse(req.headers["idempotency-key"]);
      const prior = requestCall(key);
      if (prior) return json(res, 200, prior);
      const input = callSchema.parse(JSON.parse(await body(req)));
      if (creating) return json(res, 409, { error: "ACTIVE_CALL" });
      if (input.mode === "live" && Date.now() - lastLive < 30000)
        return json(res, 429, { error: "RATE_LIMIT" });
      creating = true;
      try {
        const callPromise = createCall(input, key);
        if (input.mode === "live") lastLive = Date.now();
        const call = await callPromise;
        return json(res, 201, call);
      } finally {
        creating = false;
      }
    }
    const match = url.pathname.match(
      /^\/calls\/([0-9a-f-]{36})(?:\/(answer|cancel))?$/,
    );
    if (match) {
      const id = match[1];
      if (!getCall(id)) return json(res, 404, { error: "NOT_FOUND" });
      if (req.method === "GET" && !match[2]) return json(res, 200, getCall(id));
      if (req.method === "POST" && match[2] === "answer") {
        const data = answerSchema.parse(JSON.parse(await body(req)));
        return json(res, 200, answerUser(id, data.questionId, data.answer));
      }
      if (req.method === "POST" && match[2] === "cancel") {
        await endCall(id, "cancelled");
        return json(res, 200, getCall(id));
      }
    }
    json(res, 404, { error: "NOT_FOUND" });
  } catch (e) {
    const message = e instanceof Error ? e.message : "INTERNAL_ERROR";
    const known = [
      "ACTIVE_CALL",
      "NOT_CONFIGURED",
      "NUMBER_NOT_ALLOWED",
      "CALL_ENDED",
      "STALE_QUESTION",
      "CONNECTION_LOST",
      "BODY_TOO_LARGE",
      "RECOVERY_PENDING",
      "INVALID_INPUT",
      "CONTACT_LIMIT",
    ];
    json(
      res,
      message === "BODY_TOO_LARGE"
        ? 413
        : e instanceof z.ZodError || e instanceof SyntaxError
          ? 400
          : known.includes(message)
            ? 409
            : 500,
      {
        error:
          e instanceof z.ZodError || e instanceof SyntaxError
            ? "INVALID_INPUT"
            : known.includes(message)
              ? message
              : "INTERNAL_ERROR",
      },
    );
  }
});
const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 });
server.on("upgrade", (req, socket, head) => {
  try {
    const url = new URL(req.url || "/", "http://localhost");
    const match = url.pathname.match(/^\/media\/([0-9a-f-]{36})$/);
    if (
      !accepting ||
      !match ||
      !authorizeMedia(match[1], url.searchParams.get("token") || "")
    ) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => attachMedia(match[1], ws));
  } catch {
    socket.destroy();
  }
});
server.requestTimeout = 15000;
server.headersTimeout = 10000;
server.keepAliveTimeout = 5000;
// Bind before recovering state. A duplicate launch must not terminate the running process's calls.
await new Promise<void>((resolve, reject) => {
  server.once("error", reject);
  server.listen(Number(process.env.VOICE_PORT) || 3001, "127.0.0.1", () => {
    server.off("error", reject);
    resolve();
  });
});
await recoverCalls();
accepting = true;
console.log("Callori voice service ready on loopback.");
const recoveryTimer = setInterval(() => void recoverOrphanedCalls(), 30000);
recoveryTimer.unref();
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  accepting = false;
  clearInterval(recoveryTimer);
  server.close();
  const deadline = setTimeout(() => process.exit(1), 20000);
  deadline.unref();
  await Promise.allSettled(
    [...sessions.keys()].map((id) => endCall(id, "failed", "SERVER_RESTART")),
  );
  wss.close();
  clearTimeout(deadline);
  process.exit(0);
}
process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
