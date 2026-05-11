import { Router, Request, Response } from "express";
import { prisma } from "@life-planner/db";
import { createClient } from "@supabase/supabase-js";

const router = Router();

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
  try {
    const termCode = typeof req.query.termCode === "string" ? req.query.termCode : "202610";
    const scope = typeof req.query.scope === "string" ? req.query.scope : "open";
    const term = resolveTerm(termCode);
    const supabase = getSupabase();

    if (!supabase) {
      res.status(500).json({ message: "Supabase is not configured" });
      return;
    }

    let query = supabase
      .from("CoursesOfferedByTerm")
      .select(
        "id,termCode,courseCode,section,crn,title,unitsMin,unitsMax,unitsText,geCategories,writingCategories,instructors,meetings,consentRequired,openSeats,waitlist"
      )
      .order("courseCode", { ascending: true })
      .limit(5000);

    query = term ? query.eq("term", term) : query.eq("termCode", termCode);

    if (scope !== "all") {
      query = query.gt("openSeats", 0);
    }

    const { data, error } = await query;
    if (error) {
      res.status(500).json({ message: error.message });
      return;
    }

    res.json({ courses: data ?? [] });
  } catch (err: any) {
    res.status(500).json({ message: err?.message });
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
