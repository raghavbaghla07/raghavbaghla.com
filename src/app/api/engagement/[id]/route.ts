import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
export const runtime = "nodejs";
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function connection() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) return null;
  return {
    db: createClient(url, secret, {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
    secret,
  };
}
function visitor(request: NextRequest, secret: string) {
  const raw = request.cookies.get("rb-visitor")?.value ?? "";
  const [id, signature] = raw.split(".");
  const sign = (value: string) =>
    createHmac("sha256", secret).update(`visitor:${value}`).digest("hex");
  if (
    uuidPattern.test(id ?? "") &&
    /^[a-f0-9]{64}$/.test(signature ?? "") &&
    timingSafeEqual(Buffer.from(sign(id)), Buffer.from(signature))
  )
    return { id, value: raw };
  const next = randomUUID();
  return { id: next, value: `${next}.${sign(next)}` };
}
function respond(data: unknown, value?: string, status = 200) {
  const response = NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
  if (value)
    response.cookies.set("rb-visitor", value, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 365 * 24 * 60 * 60,
    });
  return response;
}
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!uuidPattern.test(id))
    return respond({ error: "Post not found." }, undefined, 404);
  const connectionInfo = connection();
  if (!connectionInfo)
    return respond(
      { error: "Guest interactions are not connected yet." },
      undefined,
      503,
    );
  const { db, secret } = connectionInfo;
  const guest = visitor(request, secret);
  const { data, error } = await db.rpc("guest_stats", {
    target: id,
    visitor: guest.id,
  });
  if (error)
    return respond({ error: "Couldn’t load reactions." }, undefined, 500);
  if (!data?.[0]) return respond({ error: "Post not found." }, undefined, 404);
  return respond(data[0], guest.value);
}
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (request.headers.get("origin") !== request.nextUrl.origin)
    return respond({ error: "Request origin not allowed." }, undefined, 403);
  const { id } = await params;
  if (!uuidPattern.test(id))
    return respond({ error: "Post not found." }, undefined, 404);
  const connectionInfo = connection();
  if (!connectionInfo)
    return respond(
      { error: "Guest interactions are not connected yet." },
      undefined,
      503,
    );
  const { db, secret } = connectionInfo;
  const guest = visitor(request, secret);
  try {
    const text = await request.text();
    if (text.length > 5000)
      return respond({ error: "Your comment is too long." }, undefined, 400);
    const body = JSON.parse(text);
    if (!body || !["like", "comment"].includes(body.action))
      return respond({ error: "Unknown action." }, undefined, 400);
    if (
      body.action === "comment" &&
      (typeof body.name !== "string" ||
        body.name.trim().length < 1 ||
        body.name.trim().length > 80 ||
        typeof body.body !== "string" ||
        body.body.trim().length < 3 ||
        body.body.trim().length > 2000)
    )
      return respond(
        {
          error: "Add your name and a comment between 3 and 2,000 characters.",
        },
        undefined,
        400,
      );
    // Vercel provides the client address. Hash it; never store raw IP addresses.
    const ip =
      request.headers.get("x-vercel-forwarded-for")?.split(",")[0].trim() ??
      request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
      "local-preview";
    const fingerprint = createHmac("sha256", secret)
      .update(`rate:${ip}`)
      .digest("hex");
    const { error } = await db.rpc("guest_action", {
      target: id,
      visitor: guest.id,
      fingerprint,
      operation: body.action,
      guest_name: body.name ?? null,
      guest_body: body.body ?? null,
    });
    if (error)
      return respond(
        {
          error: error.message.includes("Rate limited")
            ? "A few too many requests. Please try again later."
            : "Couldn’t save that. Please try again.",
        },
        guest.value,
        error.message.includes("Rate limited") ? 429 : 400,
      );
    const { data, error: statsError } = await db.rpc("guest_stats", {
      target: id,
      visitor: guest.id,
    });
    return respond(
      { success: true, stats: statsError ? null : (data?.[0] ?? null) },
      guest.value,
    );
  } catch {
    return respond(
      { error: "Invalid request. Please try again." },
      undefined,
      400,
    );
  }
}
