import { Router, Response } from "express";
import { createClient } from "@supabase/supabase-js";
import { AuthRequest, requireAuth } from "../middleware/auth";

const router = Router();

type TranscriptCourse = {
  courseCode: string;
  title: string;
  grade: string | null;
  quarter: string | null;
};

type AggieMateProfile = {
  userId: string;
  fullName: string;
  email: string;
  courses: TranscriptCourse[];
  freeCells: string[];
};

type UserSearchRow = {
  id: string;
  fullName: string;
  email: string;
  transcriptCourses: unknown;
};

type StudyMatch = {
  userId: string;
  name: string;
  email: string;
  commonCourses: Array<{ courseCode: string; title: string }>;
  commonFreeTimes: string[];
  score: number;
};

function getSupabaseAdmin() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

function parseJsonField<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string") return (value ?? fallback) as T;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function normalizeCourseCode(code: string): string {
  const compact = code.replace(/\s+/g, "").toUpperCase();
  const match = compact.match(/^([A-Z]{2,4})0*(\d+)([A-Z].*)?$/);
  if (!match) return compact;
  return `${match[1]}${match[2]}${match[3] ?? ""}`;
}

function formatHour(hour: number): string {
  if (hour === 12) return "12pm";
  return hour < 12 ? `${hour}am` : `${hour - 12}pm`;
}

function formatFreeCell(cell: string): string {
  const [day, rawHour] = cell.split("-");
  const hour = Number(rawHour);
  if (!day || Number.isNaN(hour)) return cell;
  return `${day} ${formatHour(hour)}-${formatHour(hour + 1)}`;
}

async function getUserProfile(userId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from("User")
    .select("id,fullName,email,transcriptCourses")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    id: data.id as string,
    email: data.email as string,
    fullName: data.fullName as string,
    transcriptCourses: parseJsonField<TranscriptCourse[]>(data.transcriptCourses, []),
  };
}

function buildStudyMatch(
  profile: AggieMateProfile,
  myCourses: Map<string, TranscriptCourse>,
  myFreeCells: Set<string>
): StudyMatch {
  const commonCourses = profile.courses
    .filter((course) => myCourses.has(normalizeCourseCode(course.courseCode)))
    .map((course) => {
      const mine = myCourses.get(normalizeCourseCode(course.courseCode));
      return {
        courseCode: mine?.courseCode ?? course.courseCode,
        title: mine?.title ?? course.title,
      };
    });
  const commonFreeCells = profile.freeCells.filter((cell) => myFreeCells.has(cell));

  return {
    userId: profile.userId,
    name: profile.fullName,
    email: profile.email,
    commonCourses,
    commonFreeTimes: commonFreeCells.map(formatFreeCell),
    score: (commonCourses.length * 100) + commonFreeCells.length,
  };
}

router.post("/api/aggie-mate/matches", requireAuth, async (req: AuthRequest, res: Response) => {
  const user = await getUserProfile(req.userId!);
  if (!user) {
    res.status(401).json({ error: "not_signed_in" });
    return;
  }

  const freeCells = Array.isArray(req.body.freeCells) ? req.body.freeCells as string[] : [];
  const currentCourses = user.transcriptCourses.filter((course) => course.grade === "IP");

  try {
    const supabase = getSupabaseAdmin();
    const { error: upsertError } = await supabase
      .from("AggieMateProfile")
      .upsert({
        userId: user.id,
        fullName: user.fullName,
        email: user.email,
        courses: currentCourses,
        freeCells,
        updatedAt: new Date().toISOString(),
      }, { onConflict: "userId" });

    if (upsertError) throw upsertError;

    const { data, error } = await supabase
      .from("AggieMateProfile")
      .select("userId,fullName,email,courses,freeCells")
      .neq("userId", user.id)
      .limit(100);

    if (error) throw error;

    const myCourses = new Map(currentCourses.map((course) => [normalizeCourseCode(course.courseCode), course]));
    const myFreeCells = new Set(freeCells);

    const matches = ((data ?? []) as AggieMateProfile[])
      .map((profile) => buildStudyMatch(profile, myCourses, myFreeCells))
      .filter((match) => match.commonCourses.length > 0 && match.commonFreeTimes.length > 0)
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
      .slice(0, 20);

    res.json({ matches });
  } catch (err) {
    console.error("[aggie mate matches error]", err);
    res.status(500).json({ error: "Failed to find study partners." });
  }
});

router.post("/api/aggie-mate/search", requireAuth, async (req: AuthRequest, res: Response) => {
  const query = typeof req.body.query === "string" ? req.body.query.trim().toLowerCase() : "";
  if (query.length < 2) {
    res.json({ results: [] });
    return;
  }

  const user = await getUserProfile(req.userId!);
  if (!user) {
    res.status(401).json({ error: "not_signed_in" });
    return;
  }

  const freeCells = Array.isArray(req.body.freeCells) ? req.body.freeCells as string[] : [];
  const currentCourses = user.transcriptCourses.filter((course) => course.grade === "IP");

  try {
    const supabase = getSupabaseAdmin();
    const searchPattern = `%${query}%`;
    const { data: nameUsers, error: nameUsersError } = await supabase
      .from("User")
      .select("id,fullName,email,transcriptCourses")
      .neq("id", user.id)
      .ilike("fullName", searchPattern)
      .limit(10);
    const { data: emailUsers, error: emailUsersError } = await supabase
      .from("User")
      .select("id,fullName,email,transcriptCourses")
      .neq("id", user.id)
      .ilike("email", searchPattern)
      .limit(10);

    if (nameUsersError) throw nameUsersError;
    if (emailUsersError) throw emailUsersError;

    const matchingUsers = Array.from(
      new Map(
        ([...((nameUsers ?? []) as UserSearchRow[]), ...((emailUsers ?? []) as UserSearchRow[])])
          .map((matchingUser) => [matchingUser.id, matchingUser])
      ).values()
    ).slice(0, 10);

    const matchingUserIds = matchingUsers.map((profile) => profile.id);
    const { data: profiles, error: profilesError } = matchingUserIds.length > 0
      ? await supabase
        .from("AggieMateProfile")
        .select("userId,fullName,email,courses,freeCells")
        .in("userId", matchingUserIds)
      : { data: [], error: null };

    if (profilesError) throw profilesError;

    const myCourses = new Map(currentCourses.map((course) => [normalizeCourseCode(course.courseCode), course]));
    const myFreeCells = new Set(freeCells);
    const profilesByUserId = new Map(
      ((profiles ?? []) as AggieMateProfile[]).map((profile) => [profile.userId, profile])
    );

    const results = matchingUsers
      .map((matchingUser) => {
        const profile = profilesByUserId.get(matchingUser.id);
        return buildStudyMatch({
          userId: matchingUser.id,
          fullName: matchingUser.fullName,
          email: matchingUser.email,
          courses: profile?.courses
            ?? parseJsonField<TranscriptCourse[]>(matchingUser.transcriptCourses, [])
              .filter((course) => course.grade === "IP"),
          freeCells: profile?.freeCells ?? [],
        }, myCourses, myFreeCells);
      })
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
      .slice(0, 10);

    res.json({ results });
  } catch (err) {
    console.error("[aggie mate search error]", err);
    res.status(500).json({ error: "Failed to search for this friend." });
  }
});

router.post("/api/aggie-mate/match", requireAuth, async (req: AuthRequest, res: Response) => {
  const user = await getUserProfile(req.userId!);
  if (!user) {
    res.status(401).json({ error: "not_signed_in" });
    return;
  }

  const receiverId = req.body.receiverId as string | undefined;
  if (!receiverId || receiverId === user.id) {
    res.status(400).json({ error: "receiverId is required." });
    return;
  }

  try {
    const pair = [user.id, receiverId].sort();
    const { error } = await getSupabaseAdmin()
      .from("AggieMateMatch")
      .upsert({
        id: `aggie_mate_match_${pair[0]}_${pair[1]}`,
        requesterId: user.id,
        receiverId,
        status: "matched",
      }, { onConflict: "id" });

    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    console.error("[aggie mate match error]", err);
    res.status(500).json({ error: "Failed to match with this student." });
  }
});

export default router;
