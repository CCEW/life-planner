import { Router, Request, Response } from "express";
import { prisma } from "@life-planner/db";
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
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) return null;

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function resolveTerm(termCode: string | undefined) {
  if (termCode === "202610") return "fall26";
  return undefined;
}

function hasProperMeetingTimes(meetings: OfferedCourseRow["meetings"]): boolean {
  return (meetings ?? []).some((meeting) => {
    const timeDays = meeting.time_days?.trim() ?? "";
    return /\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}\s*(AM|PM)/i.test(timeDays);
  });
}

// GET /courses — list with optional search and department filter
router.get("/", async (req: Request, res: Response) => {
  try {
    const q =
      typeof req.query.q === "string"
        ? req.query.q
        : undefined;

    const department =
      typeof req.query.department === "string"
        ? req.query.department
        : undefined;

    const page =
      typeof req.query.page === "string"
        ? req.query.page
        : "1";

    const limit =
      typeof req.query.limit === "string"
        ? req.query.limit
        : "20";

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where: any = {};

    if (department) {
      where.department = department;
    }

    if (q) {
      where.OR = [
        {
          courseCode: {
            contains: q,
            mode: "insensitive",
          },
        },
        {
          title: {
            contains: q,
            mode: "insensitive",
          },
        },
        {
          description: {
            contains: q,
            mode: "insensitive",
          },
        },
      ];
    }

    const [courses, total] = await Promise.all([
      prisma.course.findMany({
        where,
        skip,
        take: parseInt(limit),
        orderBy: [
          { department: "asc" },
          { courseCode: "asc" },
        ],
      }),

      prisma.course.count({
        where,
      }),
    ]);

    res.json({
      courses,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (err: any) {
    res.status(500).json({
      message: err?.message,
    });
  }
});

// GET /courses/offered?termCode=202610&scope=all
router.get("/offered", async (req: Request, res: Response) => {
  const termCode = typeof req.query.termCode === "string" ? req.query.termCode : "202610";
  const scope = typeof req.query.scope === "string" ? req.query.scope : "ge";
  const term = resolveTerm(termCode);
  const supabase = getSupabase();
  const pageSize = 1000;
  const rows: OfferedCourseRow[] = [];

  if (!supabase) {
    res.status(500).json({ message: "Supabase is not configured" });
    return;
  }

  try {
    for (let from = 0; ; from += pageSize) {
      const to = from + pageSize - 1;
      let query = supabase
        .from("CoursesOfferedByTerm")
        .select(
          [
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
          ].join(",")
        )
        .eq("consentRequired", false)
        .gt("openSeats", 0);

      query = term ? query.eq("term", term) : query.eq("termCode", termCode);

      const { data, error } = await query
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
  } catch (err: any) {
    console.error("[courses offered error]", err);
    res.status(500).json({
      message: err?.message ?? "Failed to load offered courses.",
    });
  }
});

// GET /courses/departments — unique department list
router.get("/departments", async (_req: Request, res: Response) => {
  try {
    const depts = await prisma.course.findMany({
      distinct: ["department"],
      select: {
        department: true,
      },
      orderBy: {
        department: "asc",
      },
    });

    res.json(
      depts.map((d) => d.department)
    );
  } catch (err: any) {
    res.status(500).json({
      message: err?.message,
    });
  }
});

// GET /courses/:id
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const course = await prisma.course.findUnique({
      where: {
        id: req.params.id as string,
      },
      include: {
        sections: true,
      },
    });

    if (!course) {
      res.status(404).json({
        message: "Course not found",
      });
      return;
    }

    res.json(course);
  } catch (err: any) {
    res.status(500).json({
      message: err?.message,
    });
  }
});

export default router;
