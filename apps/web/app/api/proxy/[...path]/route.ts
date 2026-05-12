import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

type Params = { path: string[] };

async function handler(req: NextRequest, context: { params: Promise<Params> }) {
  const { path } = await context.params;
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;

  const upstream = new URL(`${API}/${path.join("/")}`);
  upstream.search = req.nextUrl.search;

  const headers: Record<string, string> = {};
  const contentType = req.headers.get("content-type");
  if (contentType) {
    headers["Content-Type"] = contentType;
  }
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const body = req.method !== "GET" && req.method !== "HEAD"
    ? await req.arrayBuffer()
    : undefined;

  const upstreamRes = await fetch(upstream.toString(), {
    method: req.method,
    headers,
    body,
    redirect: "manual",
  });

  // Pass redirects through (e.g. Google OAuth flow)
  if (upstreamRes.status >= 300 && upstreamRes.status < 400) {
    const location = upstreamRes.headers.get("location");
    if (location) {
      return NextResponse.redirect(location, { status: upstreamRes.status });
    }
  }

  const responseBody = await upstreamRes.arrayBuffer();
  return new NextResponse(responseBody, {
    status: upstreamRes.status,
    headers: { "Content-Type": upstreamRes.headers.get("Content-Type") ?? "application/octet-stream" },
  });
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
