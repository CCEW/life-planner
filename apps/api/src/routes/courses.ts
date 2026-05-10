import { Router, Request, Response } from "express";
import { createClient } from "@supabase/supabase-js";

const router = Router();

type OfferedCourseRow = {
  id: string;
  termCode: string;
  courseCode: string;
  section: string | null;
  crn: string | null;
  title: string;
  unitsMin: number | null;
  unitsMax: number | null;
  unitsText: string | null;
  geCategories: string[] | null;
  writingCategories: string[] | null;
  instructors: string[] | null;
  meetings: { time_days?: string }[] | null;
  consentRequired: boolean | null;
  openSeats: number | null;
  waitlist: number | null;
};

function getSupabase() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);
}

function hasProperMeetingTimes(meetings: OfferedCourseRow["meetings"]): boolean {
  return (meetings ?? []).some((meeting) => {
    const timeDays = meeting.time_days?.trim() ?? "";
    return /\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}\s*(AM|PM)/i.test(timeDays);
  });
}

router.get("/api/courses/offered", async (req: Request, res: Response) => {
  const termCode = (req.query.termCode as string | undefined) ?? "202610";
  const scope = (req.query.scope as string | undefined) ?? "ge";
  const pageSize = 1000;
  const rows: OfferedCourseRow[] = [];

  try {
    for (let from = 0; ; from += pageSize) {
      const to = from + pageSize - 1;
      const { data, error } = await getSupabase()
        .from("CoursesOfferedByTerm")
        .select([
          "id",
          "termCode",
          "courseCode",
          "section",
          "crn",
          "title",
          "unitsMin",
          "unitsMax",
          "unitsText",
          "geCategories",
          "writingCategories",
          "instructors",
          "meetings",
          "consentRequired",
          "openSeats",
          "waitlist",
        ].join(","))
        .eq("termCode", termCode)
        .eq("consentRequired", false)
        .gt("openSeats", 0)
        .order("courseCode", { ascending: true })
        .order("section", { ascending: true })
        .range(from, to);

      if (error) throw error;
      rows.push(...((data ?? []) as unknown as OfferedCourseRow[]));
      if (!data || data.length < pageSize) break;
    }

    const courses = rows
      .filter((course) =>
        hasProperMeetingTimes(course.meetings) &&
        (
          scope === "all" ||
          (course.geCategories?.length ?? 0) > 0 ||
          (course.writingCategories?.length ?? 0) > 0
        )
      )
      .map((course) => ({
        ...course,
        geCategories: course.geCategories ?? [],
        writingCategories: course.writingCategories ?? [],
        instructors: course.instructors ?? [],
        meetings: course.meetings ?? [],
        openSeats: course.openSeats ?? 0,
        waitlist: course.waitlist ?? 0,
      }));

    res.json({ termCode, courses });
  } catch (err) {
    console.error("[courses offered error]", err);
    res.status(500).json({ error: "Failed to load offered courses." });
  }
});

export default router;
