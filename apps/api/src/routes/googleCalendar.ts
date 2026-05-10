import { Router, Response } from "express";
import { createHash } from "crypto";
import { calendar_v3, google } from "googleapis";
import jwt from "jsonwebtoken";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { AuthRequest, requireAuth } from "../middleware/auth";

const router = Router();

const FRONTEND_URL = process.env.FRONTEND_URL ?? "http://localhost:3000";
const REDIRECT_URI =
  process.env.GOOGLE_REDIRECT_URI ??
  "http://localhost:4000/auth/google/calendar/callback";

const SCOPES = [
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/userinfo.email",
];

type GoogleTokenRow = {
  accessToken: string;
  refreshToken: string | null;
  tokenExpiry: string | null;
  googleEmail: string | null;
  scopes: string[] | null;
};

function calendarEventId(userId: string, googleId: string) {
  const digest = createHash("sha1").update(`${userId}:${googleId}`).digest("hex");
  return `calendar_event_${digest}`;
}

function googleTokenId(userId: string) {
  const digest = createHash("sha1").update(userId).digest("hex");
  return `google_token_${digest}`;
}

function toCalendarDate(raw: string | null | undefined) {
  return raw ? new Date(raw) : null;
}

function dayName(date: Date) {
  return date.toLocaleDateString("en-US", { weekday: "long", timeZone: "America/Los_Angeles" });
}

function timeOfDay(date: Date) {
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/Los_Angeles",
  });
}

async function saveCalendarEvents(
  supabase: SupabaseClient,
  userId: string,
  events: calendar_v3.Schema$Event[]
) {
  const rows = events.flatMap((event) => {
    if (!event.id || !event.summary) return [];

    const start = toCalendarDate(event.start?.dateTime ?? event.start?.date);
    const end = toCalendarDate(event.end?.dateTime ?? event.end?.date);
    if (!start) return [];

    return [{
      id: calendarEventId(userId, event.id),
      userId,
      googleId: event.id,
      title: event.summary,
      day: dayName(start),
      startTime: event.start?.dateTime ? timeOfDay(start) : "00:00",
      endTime: event.end?.dateTime && end ? timeOfDay(end) : "23:59",
      type: "other",
      recurring: Boolean(event.recurringEventId),
    }];
  });

  if (rows.length === 0) return;

  const { error } = await supabase
    .from("CalendarEvent")
    .upsert(rows, { onConflict: "id" });

  if (error) throw error;
}

function makeOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    REDIRECT_URI
  );
}

function getJwtSecret() {
  return process.env.JWT_SECRET || "dev-secret-change-in-prod";
}

function signCalendarState(userId: string) {
  return jwt.sign({ userId, purpose: "google-calendar" }, getJwtSecret(), { expiresIn: "10m" });
}

function verifyCalendarState(state: string | undefined) {
  if (!state) return null;
  try {
    const payload = jwt.verify(state, getJwtSecret()) as { userId?: string; purpose?: string };
    return payload.purpose === "google-calendar" ? payload.userId ?? null : null;
  } catch {
    return null;
  }
}

function getSupabaseAdmin(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error("Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  }

  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function tokenExpiryIso(expiryDate?: number | null) {
  return new Date(expiryDate ?? Date.now() + 60 * 60 * 1000).toISOString();
}

function setGoogleCookies(
  res: Response,
  tokens: { access_token?: string | null; refresh_token?: string | null; expiry_date?: number | null },
  refreshToken?: string | null
) {
  if (tokens.access_token) {
    res.cookie("g_access", tokens.access_token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: tokens.expiry_date ? Math.max(tokens.expiry_date - Date.now(), 60_000) : 60 * 60 * 1000,
    });
  }

  const persistedRefreshToken = tokens.refresh_token ?? refreshToken;
  if (persistedRefreshToken) {
    res.cookie("g_refresh", persistedRefreshToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });
  }
}

async function getGoogleEmail(client: ReturnType<typeof makeOAuthClient>) {
  try {
    const oauth2 = google.oauth2({ version: "v2", auth: client });
    const { data } = await oauth2.userinfo.get();
    return data.email ?? null;
  } catch (error) {
    console.warn("[google calendar] could not load Google profile email", error instanceof Error ? error.message : error);
    return null;
  }
}

async function getStoredGoogleToken(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from("GoogleToken")
    .select("accessToken,refreshToken,tokenExpiry,googleEmail,scopes")
    .eq("userId", userId)
    .maybeSingle();

  if (error) throw error;
  return (data ?? null) as GoogleTokenRow | null;
}

async function clearGoogleConnection(supabase: SupabaseClient, userId: string, res: Response) {
  res.clearCookie("g_access");
  res.clearCookie("g_refresh");

  await supabase.from("GoogleToken").delete().eq("userId", userId);
  await supabase
    .from("User")
    .update({
      googleCalendarConnected: false,
      googleCalendarConnectedAt: null,
      googleCalendarEmail: null,
      updatedAt: new Date().toISOString(),
    })
    .eq("id", userId);
}

function isGoogleAuthError(err: unknown) {
  const error = err as {
    code?: number;
    status?: number;
    response?: { status?: number };
    message?: string;
    errors?: Array<{ reason?: string; message?: string }>;
  };
  const status = error.code ?? error.status ?? error.response?.status;
  const message = error.message ?? "";
  const reasons = (error.errors ?? []).map((item) => `${item.reason ?? ""} ${item.message ?? ""}`).join(" ");

  return (
    status === 401 ||
    /invalid authentication credentials|invalid credentials|invalid_grant|unauthorized/i.test(message) ||
    /auth|credential|invalid_grant/i.test(reasons)
  );
}

async function persistGoogleConnection(
  supabase: SupabaseClient,
  userId: string,
  tokens: { access_token?: string | null; refresh_token?: string | null; expiry_date?: number | null; scope?: string | null },
  googleEmail: string | null
) {
  if (!tokens.access_token) throw new Error("Google did not return an access token.");

  const existing = await getStoredGoogleToken(supabase, userId).catch(() => null);
  const refreshToken = tokens.refresh_token ?? existing?.refreshToken;
  if (!refreshToken) throw new Error("Google did not return a refresh token. Try reconnecting Google Calendar.");

  const now = new Date().toISOString();
  const scopes = tokens.scope ? tokens.scope.split(/\s+/).filter(Boolean) : SCOPES;
  const tokenEmail = googleEmail ?? existing?.googleEmail ?? null;

  const { error: tokenError } = await supabase
    .from("GoogleToken")
    .upsert(
      {
        id: googleTokenId(userId),
        userId,
        accessToken: tokens.access_token,
        refreshToken,
        tokenExpiry: tokenExpiryIso(tokens.expiry_date),
        googleEmail: tokenEmail,
        scopes,
        updatedAt: now,
      },
      { onConflict: "userId" }
    );

  if (tokenError) throw tokenError;

  const userUpdate: Record<string, unknown> = {
    googleCalendarConnected: true,
    googleCalendarConnectedAt: now,
    updatedAt: now,
  };
  if (tokenEmail) userUpdate.googleCalendarEmail = tokenEmail;

  const { error: userError } = await supabase
    .from("User")
    .update(userUpdate)
    .eq("id", userId);

  if (userError) throw userError;

  return { refreshToken, googleEmail: tokenEmail };
}

async function persistTokenRefresh(
  supabase: SupabaseClient,
  userId: string,
  existing: GoogleTokenRow,
  tokens: { access_token?: string | null; refresh_token?: string | null; expiry_date?: number | null; scope?: string | null }
) {
  if (!tokens.access_token && !tokens.refresh_token && !tokens.expiry_date) return;

  await persistGoogleConnection(
    supabase,
    userId,
    {
      access_token: tokens.access_token ?? existing.accessToken,
      refresh_token: tokens.refresh_token ?? existing.refreshToken,
      expiry_date: tokens.expiry_date ?? (existing.tokenExpiry ? new Date(existing.tokenExpiry).getTime() : undefined),
      scope: tokens.scope ?? existing.scopes?.join(" "),
    },
    existing.googleEmail
  );
}

router.get("/auth/google/calendar/init", requireAuth, (req: AuthRequest, res: Response) => {
  const client = makeOAuthClient();
  const url = client.generateAuthUrl({
    access_type: "offline",
    include_granted_scopes: true,
    prompt: "consent",
    scope: SCOPES,
    state: signCalendarState(req.userId!),
  });
  res.redirect(url);
});

router.get("/auth/google/calendar/callback", async (req: AuthRequest, res: Response) => {
  const code = req.query.code as string | undefined;
  const userId = verifyCalendarState(req.query.state as string | undefined);

  if (!code) {
    return res.redirect(`${FRONTEND_URL}/schedule?error=missing_code`);
  }

  if (!userId) {
    return res.redirect(`${FRONTEND_URL}/schedule?error=auth_required`);
  }

  try {
    const supabase = getSupabaseAdmin();
    const client = makeOAuthClient();
    const { tokens } = await client.getToken(code);

    client.setCredentials(tokens);
    const googleEmail = await getGoogleEmail(client);
    const saved = await persistGoogleConnection(supabase, userId, tokens, googleEmail);

    setGoogleCookies(res, tokens, saved.refreshToken);
    res.redirect(`${FRONTEND_URL}/schedule?connected=true`);
  } catch (err: any) {
    console.error("Google OAuth callback error:", err?.message ?? err);
    res.redirect(`${FRONTEND_URL}/schedule?error=oauth_failed`);
  }
});

router.get("/api/calendar/events", requireAuth, async (req: AuthRequest, res: Response) => {
  const supabase = getSupabaseAdmin();

  try {
    const stored = await getStoredGoogleToken(supabase, req.userId!);

    if (!stored?.accessToken) {
      return res.status(401).json({ error: "not_connected" });
    }

    if (
      stored.googleEmail &&
      req.userEmail &&
      stored.googleEmail.toLowerCase() !== req.userEmail.toLowerCase()
    ) {
      await clearGoogleConnection(supabase, req.userId!, res);
      return res.status(401).json({ error: "google_account_mismatch" });
    }

    const accessToken = stored.accessToken;
    const refreshToken = stored.refreshToken;
    const client = makeOAuthClient();

    client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
      expiry_date: stored?.tokenExpiry ? new Date(stored.tokenExpiry).getTime() : undefined,
    });

    client.on("tokens", (newTokens) => {
      if (newTokens.access_token) setGoogleCookies(res, newTokens, refreshToken);
      if (stored) void persistTokenRefresh(supabase, req.userId!, stored, newTokens);
    });

    const calendar = google.calendar({ version: "v3", auth: client });
    const now = new Date();
    const end = new Date();
    end.setDate(now.getDate() + 30);

    const { data } = await calendar.events.list({
      calendarId: "primary",
      timeMin: now.toISOString(),
      timeMax: end.toISOString(),
      singleEvents: true,
      orderBy: "startTime",
      maxResults: 50,
    });

    const events = data.items ?? [];
    await saveCalendarEvents(supabase, req.userId!, events);

    res.json({ events });
  } catch (err: any) {
    console.error("Calendar fetch error:", err?.message ?? err);
    if (isGoogleAuthError(err)) {
      try {
        await clearGoogleConnection(supabase, req.userId!, res);
      } catch (cleanupErr) {
        console.warn(
          "[google calendar] failed to clear stale credentials",
          cleanupErr instanceof Error ? cleanupErr.message : cleanupErr
        );
      }
      res.status(401).json({ error: "google_auth_invalid" });
      return;
    }
    res.status(500).json({ error: "fetch_failed" });
  }
});

router.post("/api/calendar/disconnect", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const supabase = getSupabaseAdmin();
    await clearGoogleConnection(supabase, req.userId!, res);
    res.json({ ok: true });
  } catch (err: any) {
    console.error("Google disconnect error:", err?.message ?? err);
    res.status(500).json({ error: "disconnect_failed" });
  }
});

export default router;
