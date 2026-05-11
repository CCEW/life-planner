import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { createClient } from "@supabase/supabase-js";

function getJwtSecret() {
  return process.env.JWT_SECRET || "dev-secret-change-in-prod";
}

export interface AuthRequest extends Request {
  userId?: string;
  userEmail?: string;
  userMetadata?: Record<string, unknown>;
}

function getToken(req: AuthRequest) {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    return header.slice(7);
  }

  return (req as any).cookies?.token as string | undefined;
}

function getSupabase() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) return null;

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const token = getToken(req);
  if (!token) {
    res.status(401).json({ message: "Missing token" });
    return;
  }

  try {
    const payload = jwt.verify(token, getJwtSecret()) as { userId: string };
    req.userId = payload.userId;
    next();
    return;
  } catch {
    // Supabase Auth access tokens are also accepted because signin/signup use Supabase Auth.
  }

  try {
    const supabase = getSupabase();
    if (!supabase) {
      res.status(401).json({ message: "Invalid token and Supabase auth is not configured" });
      return;
    }

    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) {
      res.status(401).json({ message: "Invalid or expired token" });
      return;
    }

    req.userId = data.user.id;
    req.userEmail = data.user.email ?? undefined;
    req.userMetadata = data.user.user_metadata ?? {};
    next();
  } catch {
    res.status(401).json({ message: "Invalid or expired token" });
    return;
  }
}

export function signToken(userId: string): string {
  return jwt.sign({ userId }, getJwtSecret(), { expiresIn: "7d" });
}
