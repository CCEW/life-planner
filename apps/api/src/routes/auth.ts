import { Router, Request, Response } from "express";
import { createClient } from "@supabase/supabase-js";

const router = Router();

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!
  );
}

function getSupabaseAdmin() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

function clearUserScopedCookies(res: Response) {
  res.clearCookie("token");
  res.clearCookie("g_access");
  res.clearCookie("g_refresh");
}

async function upsertUserProfile(user: {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown>;
}, fallback?: {
  fullName?: string;
  major?: string | null;
  graduationYear?: string | number | null;
}) {
  const email = user.email ?? "";
  const metadata = user.user_metadata ?? {};
  const fullName =
    fallback?.fullName ??
    (metadata.full_name as string | undefined) ??
    (email ? email.split("@")[0] : "Student");
  const major =
    fallback?.major ??
    (metadata.major as string | undefined) ??
    null;
  const graduationYearValue =
    fallback?.graduationYear ??
    (metadata.graduation_year as string | number | undefined) ??
    null;
  const now = new Date().toISOString();

  const { error } = await getSupabaseAdmin()
    .from("User")
    .upsert(
      {
        id: user.id,
        email,
        fullName,
        passwordHash: null,
        major,
        graduationYear: graduationYearValue ? Number(graduationYearValue) : null,
        updatedAt: now,
      },
      { onConflict: "id" }
    );

  if (error) throw error;
}

// POST /auth/signup
router.post("/auth/signup", async (req: Request, res: Response) => {
  const { fullName, email, password, major, graduationYear } = req.body as {
    fullName?: string;
    email?: string;
    password?: string;
    major?: string;
    graduationYear?: string | number;
  };

  if (!fullName || !email || !password) {
    res.status(400).json({ error: "fullName, email, and password are required." });
    return;
  }

  if (!email.endsWith("@ucdavis.edu")) {
    res.status(400).json({ error: "Only UC Davis email addresses are allowed." });
    return;
  }

  if (password.length < 8) {
    res.status(400).json({ error: "Password must be at least 8 characters." });
    return;
  }

  try {
    const { data, error } = await getSupabase().auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          major: major || null,
          graduation_year: graduationYear ? Number(graduationYear) : null,
        },
      },
    });

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }

    if (data.user) {
      await upsertUserProfile(data.user, { fullName, major: major || null, graduationYear });
    }

    if (data.session) {
      clearUserScopedCookies(res);
      res.cookie("token", data.session.access_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });
    }

    res.status(201).json({
      user: data.user,
      token: data.session?.access_token ?? null,
      needsEmailConfirmation: !data.session,
    });
  } catch (err) {
    console.error("[signup error]", err);
    res.status(500).json({ error: "Signup failed. Check the API logs." });
  }
});

// POST /auth/signin
router.post("/auth/signin", async (req: Request, res: Response) => {
  const { email, password } = req.body as { email?: string; password?: string };

  if (!email || !password) {
    res.status(400).json({ error: "email and password are required." });
    return;
  }

  try {
    const { data, error } = await getSupabase().auth.signInWithPassword({ email, password });

    if (error) {
      res.status(401).json({ error: error.message });
      return;
    }

    await upsertUserProfile(data.user);

    clearUserScopedCookies(res);
    res.cookie("token", data.session.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({ user: data.user, token: data.session.access_token });
  } catch (err) {
    console.error("[signin error]", err);
    res.status(500).json({ error: "Sign in failed. Check the API logs." });
  }
});

// POST /auth/signout
router.post("/auth/signout", (_req: Request, res: Response) => {
  clearUserScopedCookies(res);
  res.json({ ok: true });
});

export default router;
