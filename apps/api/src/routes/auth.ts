import { Router, Request, Response } from "express";
import { createClient } from "@supabase/supabase-js";
import { prisma } from "@life-planner/db";

const router = Router();

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!
  );
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
      await prisma.user.upsert({
        where: { id: data.user.id },
        create: {
          id: data.user.id,
          email: email,
          fullName: fullName,
          passwordHash: "",
          major: major || null,
          graduationYear: graduationYear ? Number(graduationYear) : null,
        },
        update: {
          email: email,
          fullName: fullName,
          major: major || null,
          graduationYear: graduationYear ? Number(graduationYear) : null,
        },
      }).catch((e) => console.warn("[signup] prisma upsert skipped:", e?.message));
    }

    if (data.session) {
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

    await prisma.user.upsert({
      where: { id: data.user.id },
      create: {
        id: data.user.id,
        email: data.user.email!,
        fullName: (data.user.user_metadata?.full_name as string | undefined) ?? data.user.email!.split("@")[0],
        passwordHash: "",
        major: (data.user.user_metadata?.major as string | undefined) ?? null,
        graduationYear: data.user.user_metadata?.graduation_year ? Number(data.user.user_metadata.graduation_year) : null,
      },
      update: {},
    }).catch((e) => console.warn("[signin] prisma upsert skipped:", e?.message));

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

export default router;
