import { NextRequest } from "next/server";
import { BodyTooLarge, readLimitedBody } from "@/lib/request-body";
import { internalToken } from "@/lib/internal-token";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function proxy(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const host = req.headers.get("host") || "";
  // This single-user MVP is local-only. A tunnel may expose the voice service, never this UI.
  if (!/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host))
    return Response.json({ error: "LOCAL_ONLY" }, { status: 403 });
  if (req.method !== "GET") {
    const origin = req.headers.get("origin");
    let originHost = "";
    try {
      originHost = origin ? new URL(origin).host : "";
    } catch {
      /* Reject malformed origins. */
    }
    if (!origin || originHost !== host)
      return Response.json({ error: "INVALID_ORIGIN" }, { status: 403 });
    if (!req.headers.get("content-type")?.includes("application/json"))
      return Response.json({ error: "INVALID_INPUT" }, { status: 415 });
  }
  const { path } = await params;
  const route = path.join("/");
  if (
    !/^(state|profile|maps-config|contacts(?:\/remove)?|calls(?:\/[0-9a-f-]{36}(?:\/(answer|cancel))?)?)$/.test(
      route,
    )
  )
    return Response.json({ error: "NOT_FOUND" }, { status: 404 });
  if (Number(req.headers.get("content-length") || 0) > 32768)
    return Response.json({ error: "INVALID_INPUT" }, { status: 413 });
  try {
    const body =
      req.method === "GET" ? undefined : await readLimitedBody(req.body);
    const response = await fetch(
      `${process.env.VOICE_SERVER_URL || "http://127.0.0.1:3001"}/${route}`,
      {
        method: req.method,
        headers: {
          Authorization: `Bearer ${internalToken()}`,
          "Content-Type": "application/json",
          "Idempotency-Key": req.headers.get("idempotency-key") || "",
        },
        body,
        cache: "no-store",
        signal: AbortSignal.timeout(25000),
      },
    );
    return new Response(response.body, {
      status: response.status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof BodyTooLarge)
      return Response.json({ error: "INVALID_INPUT" }, { status: 413 });
    return Response.json({ error: "SERVICE_UNAVAILABLE" }, { status: 503 });
  }
}
export { proxy as GET, proxy as POST, proxy as PUT };
