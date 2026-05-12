import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export async function POST(_req: NextRequest) {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;

  if (token) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    try {
      await fetch(`${API}/auth/signout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
    } catch {
      // proceed with local signout even if upstream fails or times out
    } finally {
      clearTimeout(timeout);
    }
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set("token", "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
    secure: process.env.NODE_ENV === "production",
  });

  return res;
}
