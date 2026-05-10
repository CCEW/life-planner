import { Router, Request, Response } from "express";
import { createClient } from "@supabase/supabase-js";

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

function getSupabase() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);
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

async function getCurrentUser(req: Request) {
  const token = req.cookies?.token as string | undefined;
  if (!token) return null;

  const { data, error } = await getSupabase().auth.getUser(token);
  if (error || !data.user) return null;

  return {
    id: data.user.id,
    email: data.user.email ?? "",
    fullName: (data.user.user_metadata?.full_name as string | undefined) ?? data.user.email ?? "Student",
  };
}

router.post("/api/aggie-mate/matches", async (req: Request, res: Response) => {
  const user = await getCurrentUser(req);
  if (!user) {
    res.status(401).json({ error: "not_signed_in" });
    return;
  }

  const courses = Array.isArray(req.body.courses) ? req.body.courses as TranscriptCourse[] : [];
  const freeCells = Array.isArray(req.body.freeCells) ? req.body.freeCells as string[] : [];
  const currentCourses = courses.filter((course) => course.grade === "IP");

  try {
    const supabase = getSupabase();
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
      .select("userId, fullName, email, courses, freeCells")
      .neq("userId", user.id)
      .limit(100);

    if (error) throw error;

    const myCourses = new Map(currentCourses.map((course) => [normalizeCourseCode(course.courseCode), course]));
    const myFreeCells = new Set(freeCells);

    const matches = ((data ?? []) as AggieMateProfile[])
      .map((profile) => {
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
      })
      .filter((match) => match.commonCourses.length > 0 && match.commonFreeTimes.length > 0)
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
      .slice(0, 20);

    res.json({ matches });
  } catch (err) {
    console.error("[aggie mate matches error]", err);
    res.status(500).json({ error: "Failed to find study partners." });
  }
});

router.post("/api/aggie-mate/match", async (req: Request, res: Response) => {
  const user = await getCurrentUser(req);
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
    const { error } = await getSupabase()
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
