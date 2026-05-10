import { Router, Request, Response } from "express";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

const router = Router();

type ProfessorRow = {
  id: string;
  name: string;
  email: string | null;
  title: string | null;
  department: string | null;
  dept: string | null;
  office: string | null;
  phoneNumber: string | null;
  personalSite: string | null;
  sourceUrl: string | null;
  about: string | null;
  labName: string | null;
  labDescription: string | null;
  interests: string[] | null;
  researchInterestIds: string[] | null;
  departmentSubjects: string[] | null;
  topicScores: Record<string, unknown> | null;
  topicKeywordHits: Record<string, unknown> | null;
  topMatchedRequirementCourses: unknown[] | null;
};

let supabase: SupabaseClient | null = null;

function getSupabase() {
  if (supabase) {
    return supabase;
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY are required.");
  }

  supabase = createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return supabase;
}

function cleanString(value: string | null | undefined, fallback = "") {
  const cleaned = value?.trim();
  if (!cleaned || cleaned.toLowerCase() === "info not applicable") {
    return fallback;
  }
  return cleaned;
}

function toProfessorSearchProfile(row: ProfessorRow) {
  const department = cleanString(row.department ?? row.dept);
  const about = cleanString(row.about ?? row.labDescription);
  const interests = (row.interests ?? []).map((interest) => cleanString(interest)).filter(Boolean);

  return {
    id: row.id,
    name: row.name,
    email: cleanString(row.email),
    title: cleanString(row.title),
    department,
    dept: department,
    office: cleanString(row.office),
    phoneNumber: cleanString(row.phoneNumber),
    personalSite: cleanString(row.personalSite),
    sourceUrl: cleanString(row.sourceUrl),
    about,
    labName: cleanString(row.labName),
    labDescription: cleanString(row.labDescription ?? row.about),
    interests,
    researchInterestIds: row.researchInterestIds ?? [],
    departmentSubjects: row.departmentSubjects ?? [],
    topicScores: row.topicScores ?? {},
    topicKeywordHits: row.topicKeywordHits ?? {},
    topMatchedRequirementCourses: row.topMatchedRequirementCourses ?? [],
  };
}

router.get("/professors", async (_req: Request, res: Response) => {
  try {
    const { data, error } = await getSupabase()
      .from("Professor")
      .select(
        [
          "id",
          "name",
          "email",
          "title",
          "department",
          "dept",
          "office",
          "phoneNumber",
          "personalSite",
          "sourceUrl",
          "about",
          "labName",
          "labDescription",
          "interests",
          "researchInterestIds",
          "departmentSubjects",
          "topicScores",
          "topicKeywordHits",
          "topMatchedRequirementCourses",
        ].join(",")
      )
      .order("name", { ascending: true })
      .limit(1000);

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.json({
      professors: ((data ?? []) as unknown as ProfessorRow[]).map(toProfessorSearchProfile),
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to load professors.",
    });
  }
});

export default router;
