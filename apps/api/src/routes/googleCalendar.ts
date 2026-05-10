import { Router, Request, Response } from "express";
import { google } from "googleapis";

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

function makeOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    REDIRECT_URI
  );
}

// ── Step 1: redirect user to Google consent screen ───────────────────────────
router.get("/auth/google/calendar/init", (_req: Request, res: Response) => {
  const client = makeOAuthClient();
  const url = client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",          // always ask so we get a refresh token
  });
  res.redirect(url);
});

// ── Step 2: Google redirects back here with ?code= ───────────────────────────
router.get("/auth/google/calendar/callback", async (req: Request, res: Response) => {
  const code = req.query.code as string | undefined;

  if (!code) {
    return res.redirect(`${FRONTEND_URL}/schedule?error=missing_code`);
  }

  try {
    const client = makeOAuthClient();
    const { tokens } = await client.getToken(code);

    const maxAge = tokens.expiry_date
      ? tokens.expiry_date - Date.now()
      : 60 * 60 * 1000; // 1 h fallback

    res.cookie("g_access", tokens.access_token, {
      httpOnly: true,
      sameSite: "lax",
      maxAge,
    });

    if (tokens.refresh_token) {
      res.cookie("g_refresh", tokens.refresh_token, {
        httpOnly: true,
        sameSite: "lax",
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      });
    }

    res.redirect(`${FRONTEND_URL}/schedule?connected=true`);
  } catch (err: any) {
    console.error("Google OAuth callback error:", err?.message ?? err);
    res.redirect(`${FRONTEND_URL}/schedule?error=oauth_failed`);
  }
});

// ── Step 3: frontend fetches events using the stored cookie ──────────────────
router.get("/api/calendar/events", async (req: Request, res: Response) => {
  const accessToken  = (req as any).cookies?.g_access  as string | undefined;
  const refreshToken = (req as any).cookies?.g_refresh as string | undefined;

  if (!accessToken) {
    return res.status(401).json({ error: "not_connected" });
  }

  try {
    const client = makeOAuthClient();
    client.setCredentials({ access_token: accessToken, refresh_token: refreshToken });

    // If the access token was refreshed automatically, update the cookie
    client.on("tokens", (newTokens) => {
      if (newTokens.access_token) {
        res.cookie("g_access", newTokens.access_token, {
          httpOnly: true,
          sameSite: "lax",
          maxAge: newTokens.expiry_date
            ? newTokens.expiry_date - Date.now()
            : 60 * 60 * 1000,
        });
      }
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

    res.json({ events: data.items ?? [] });
  } catch (err: any) {
    console.error("Calendar fetch error:", err?.message ?? err);
    res.status(500).json({ error: "fetch_failed" });
  }
});

// ── Disconnect: clear cookies ────────────────────────────────────────────────
router.post("/api/calendar/disconnect", (_req: Request, res: Response) => {
  res.clearCookie("g_access");
  res.clearCookie("g_refresh");
  res.json({ ok: true });
});

export default router;
