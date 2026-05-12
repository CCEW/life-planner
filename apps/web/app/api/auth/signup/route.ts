import { NextRequest, NextResponse } from "next/server";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${API}/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return NextResponse.json({ error: "Auth service unavailable" }, { status: 502 });
  }

  let data: Record<string, unknown>;
  try {
    data = await upstream.json();
  } catch {
    return NextResponse.json({ error: "Invalid response from auth service" }, { status: 502 });
  }

  if (!upstream.ok) {
    return NextResponse.json(data, { status: upstream.status });
  }

  if (data.needsEmailConfirmation) {
    return NextResponse.json({ needsEmailConfirmation: true });
  }

  if (!data.token) {
    return NextResponse.json({ error: "No token returned by auth service" }, { status: 502 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set("token", data.token as string, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
    secure: process.env.NODE_ENV === "production",
  });

  return res;
}
